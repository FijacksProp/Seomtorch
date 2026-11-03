"""Private student feedback and mutual-friend messaging. Text only."""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, F, OuterRef, Q, Subquery
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, throttling
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .community_views import _blocked_ids, _get_buddy_ids, _user_card
from .models import BuddyMessage, StudentBlock, StudentFeedback, StudentFollow
from .feedback_prompts import claim_post_practice_prompt

User = get_user_model()


class MessageInput(serializers.Serializer):
    body = serializers.CharField(max_length=2000, trim_whitespace=True)
    client_id = serializers.UUIDField()


class FeedbackInput(serializers.Serializer):
    body = serializers.CharField(min_length=5, max_length=4000, trim_whitespace=True)
    category = serializers.ChoiceField(choices=("general", "improvement", "bug"))
    client_id = serializers.UUIDField()


class ReportInput(serializers.Serializer):
    reason = serializers.CharField(min_length=5, max_length=1000, trim_whitespace=True)


class BlockInput(serializers.Serializer):
    public_id = serializers.CharField(min_length=6, max_length=6, trim_whitespace=True)


def _feedback_payload(item):
    # Internal admin notes are never returned to a student.
    return {
        "id": str(item.id), "category": item.category, "body": item.body,
        "status": item.status, "status_label": item.get_status_display(), "created_at": item.created_at,
    }


def _message_payload(item, user):
    return {
        "id": item.id, "client_id": str(item.client_id), "body": item.body,
        "mine": item.sender_id == user.id, "created_at": item.created_at,
    }


def _peer(user, public_id):
    peer = get_object_or_404(User, public_id__iexact=public_id, is_active=True)
    if peer.id == user.id or peer.id not in _get_buddy_ids(user):
        raise PermissionDenied("Messaging is available only between mutual buddies. Follow each other to chat.")
    return peer


class PrivateView(APIView):
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response


class WriteThrottleView(PrivateView):
    throttle_classes = [throttling.ScopedRateThrottle]

    def get_throttles(self):
        return super().get_throttles() if self.request.method == "POST" else []


class FeedbackView(WriteThrottleView):
    throttle_scope = "student_feedback"

    def get(self, request):
        items = request.user.feedback_submissions.exclude(category=StudentFeedback.Category.SAFETY)[:20]
        return Response({"feedback": [_feedback_payload(item) for item in items]})

    def post(self, request):
        serializer = FeedbackInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        item, created = StudentFeedback.objects.get_or_create(
            user=request.user, client_id=data["client_id"],
            defaults={"body": data["body"], "category": data["category"]},
        )
        if item.body != data["body"] or item.category != data["category"]:
            return Response({"detail": "This submission ID belongs to a different message."}, status=409)
        return Response(_feedback_payload(item), status=201 if created else 200)


class FeedbackPromptView(WriteThrottleView):
    throttle_scope = "feedback_prompt"

    def post(self, request):
        class PromptInput(serializers.Serializer):
            session_id = serializers.UUIDField()

        serializer = PromptInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"show": claim_post_practice_prompt(request.user, serializer.validated_data["session_id"])})


class BuddyInboxView(PrivateView):
    def get(self, request):
        user = request.user
        messages = BuddyMessage.objects.filter(
            Q(sender=user, recipient=OuterRef("pk")) | Q(recipient=user, sender=OuterRef("pk"))
        ).order_by("-id")
        unread = BuddyMessage.objects.filter(
            recipient=user, sender=OuterRef("pk"), read_at__isnull=True,
        ).order_by().values("sender").annotate(total=Count("pk")).values("total")
        buddies = User.objects.filter(
            id__in=_get_buddy_ids(user), is_active=True,
        ).select_related("learning_stats").annotate(
            latest_body=Subquery(messages.values("body")[:1]),
            latest_at=Subquery(messages.values("created_at")[:1]),
            unread_total=Subquery(unread[:1]),
        ).order_by(F("latest_at").desc(nulls_last=True), "username")[:100]
        conversations = []
        for buddy in buddies:
            conversations.append({
                **_user_card(buddy), "preview": buddy.latest_body or "",
                "latest_at": buddy.latest_at, "unread": buddy.unread_total or 0,
            })
        return Response({"conversations": conversations, "unread": sum(item["unread"] for item in conversations)})


class BuddyMessagesView(WriteThrottleView):
    throttle_scope = "buddy_messages"

    def get(self, request, public_id):
        peer = _peer(request.user, public_id)
        before, after = request.query_params.get("before"), request.query_params.get("after")
        if before and after:
            raise ValidationError({"cursor": "Use either before or after, not both."})
        cursor = before or after
        if cursor is not None:
            try:
                cursor = int(cursor)
            except (ValueError, TypeError):
                raise ValidationError({"cursor": "Enter a valid message cursor."})
            if not 0 <= cursor <= 9223372036854775807:
                raise ValidationError({"cursor": "Enter a valid message cursor."})
        messages = BuddyMessage.objects.filter(
            Q(sender=request.user, recipient=peer) | Q(sender=peer, recipient=request.user)
        )
        if before:
            messages = messages.filter(id__lt=cursor)
        elif after:
            messages = messages.filter(id__gt=cursor)
        rows = list(messages.order_by("id" if after else "-id")[:41])
        has_more = len(rows) > 40
        rows = rows[:40]
        if not after:
            rows.reverse()
        # Mark only the delivered incoming messages, never unseen older pages.
        BuddyMessage.objects.filter(
            id__in=[item.id for item in rows], recipient=request.user, read_at__isnull=True,
        ).update(read_at=timezone.now())
        return Response({
            "peer": _user_card(peer), "messages": [_message_payload(item, request.user) for item in rows],
            "has_more": has_more, "next_before": rows[0].id if rows else None,
        })

    @transaction.atomic
    def post(self, request, public_id):
        peer = _peer(request.user, public_id)
        serializer = MessageInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        message, created = BuddyMessage.objects.get_or_create(
            sender=request.user, client_id=data["client_id"],
            defaults={"recipient": peer, "body": data["body"]},
        )
        if message.recipient_id != peer.id or message.body != data["body"]:
            return Response({"detail": "This response ID belongs to a different message."}, status=409)
        return Response(_message_payload(message, request.user), status=201 if created else 200)


class MessageReportView(WriteThrottleView):
    throttle_scope = "student_feedback"

    def post(self, request, message_id):
        # A student can report only messages they personally received.
        message = get_object_or_404(
            BuddyMessage.objects.select_related("sender"), id=message_id, recipient=request.user,
        )
        serializer = ReportInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]
        item, created = StudentFeedback.objects.get_or_create(
            user=request.user, reported_message=message,
            defaults={
                "category": StudentFeedback.Category.SAFETY,
                "body": f"Reason: {reason}\n\nReported message from {message.sender.username} ({message.sender.public_id}):\n{message.body}",
            },
        )
        return Response({"id": str(item.id), "status": item.status}, status=201 if created else 200)


class BuddyBlocksView(WriteThrottleView):
    throttle_scope = "community_actions"

    def get(self, request):
        blocks = StudentBlock.objects.filter(blocker=request.user).select_related("blocked").order_by("-created_at")[:100]
        return Response({"blocked": [
            {"public_id": item.blocked.public_id, "username": item.blocked.username}
            for item in blocks
        ]})

    @transaction.atomic
    def post(self, request):
        serializer = BlockInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        public_id = serializer.validated_data["public_id"]
        target = get_object_or_404(User, public_id__iexact=public_id, is_active=True)
        if target.id == request.user.id:
            raise ValidationError({"public_id": "You cannot block yourself."})
        StudentBlock.objects.get_or_create(blocker=request.user, blocked=target)
        StudentFollow.objects.filter(
            Q(follower=request.user, following=target) | Q(follower=target, following=request.user)
        ).delete()
        return Response({"detail": "Account blocked. Your connection has been removed."})


class BuddyUnblockView(PrivateView):
    def delete(self, request, public_id):
        StudentBlock.objects.filter(blocker=request.user, blocked__public_id__iexact=public_id).delete()
        return Response(status=204)
