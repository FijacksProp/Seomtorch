from django.utils import timezone
from django.utils.crypto import constant_time_compare
from datetime import timedelta
from rest_framework import permissions, serializers, throttling
from rest_framework.response import Response
from rest_framework.views import APIView

from .email_security import browser_digest, digest, issue_challenge, verify_challenge, security_status
from .models import EmailSignInChallenge
from .serializers import UserSerializer


class EmailCodeThrottle(throttling.AnonRateThrottle):
    scope = "email_code"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class RequestEmailVerificationView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [EmailCodeThrottle]

    def post(self, request):
        return Response(issue_challenge(request.user, request.data.get("browser_key")), status=202)


class AccountSecurityView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(security_status(request.user))


class VerifyEmailCodeView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [EmailCodeThrottle]

    def post(self, request):
        user, token = verify_challenge(request.data.get("challenge_id"), request.data.get("code"), request.data.get("browser_key"))
        from learning.models import ActivityEvent
        ActivityEvent.objects.create(user=user, event_type=ActivityEvent.Type.SIGNED_IN)
        return Response({"token": token, "user": UserSerializer(user).data})


class ResendEmailCodeView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [EmailCodeThrottle]

    def post(self, request):
        # UUID parsing prevents malformed values becoming database errors.
        challenge_id = serializers.UUIDField().run_validation(request.data.get("challenge_id"))
        browser_hash = browser_digest(request.data.get("browser_key"))
        challenge = EmailSignInChallenge.objects.select_related("user").filter(pk=challenge_id).first()
        if not challenge or challenge.consumed_at or not challenge.user.is_active or challenge.created_at < timezone.now() - timedelta(minutes=30) or challenge.email != challenge.user.email or not constant_time_compare(challenge.browser_hash, browser_hash) or not constant_time_compare(challenge.password_fingerprint, digest(challenge.user.password, "password")):
            raise serializers.ValidationError("This request is no longer available. Sign in again.")
        return Response(issue_challenge(challenge.user, request.data.get("browser_key")), status=202)
