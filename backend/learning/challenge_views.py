import logging
import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import DatabaseError, transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ActivityEvent, Challenge, ChallengeParticipant, PracticeSession, Question, Subject, UserStats

logger = logging.getLogger(__name__)


def _record_activity(user, event_type, metadata):
    """Keep optional monitoring writes from rolling back a student's action."""
    def write_event():
        try:
            ActivityEvent.objects.create(user=user, event_type=event_type, metadata=metadata)
        except DatabaseError:
            logger.exception("Challenge activity could not be recorded", extra={"user_id": user.pk, "event_type": event_type})

    # Monitoring is useful, but it must happen after the student-facing
    # transaction commits and must never decide whether that action succeeds.
    transaction.on_commit(write_event)


def _aware_datetime(value):
    parsed = parse_datetime(str(value or ""))
    if parsed and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def _question_snapshot(question):
    return {
        "external_id": question.external_id,
        "subject": question.topic.subject.slug,
        "topic": question.topic.name,
        "text": question.text,
        "options": question.options,
        "correct": question.correct_index,
        "explanation": question.explanation,
        "difficulty": question.difficulty,
        "questionYear": question.question_year,
        "passage_title": question.passage.title if question.passage else "",
        "passage_body": question.passage.body if question.passage else "",
        "video_url": question.video_url,
        "image_url": question.image_url,
    }


def _public_questions(challenge):
    private_fields = {"correct", "explanation"}
    return [{key: value for key, value in item.items() if key not in private_fields} for item in challenge.question_payload]


def _select_questions(subject_slug, limit):
    subjects = list(Subject.objects.filter(is_active=True).order_by("position", "name"))
    priority = {"english": 0, "mathematics": 1, "general-paper": 2}
    subjects.sort(key=lambda item: (priority.get(item.slug, 99), item.position))
    if subject_slug != "all":
        subject = get_object_or_404(Subject, slug=subject_slug, is_active=True)
        pool = list(Question.objects.filter(topic__subject=subject, is_active=True).select_related("topic__subject", "passage"))
        random.shuffle(pool)
        return subject, pool[:limit]

    pools = {}
    allocations = {subject.id: 0 for subject in subjects}
    for subject in subjects:
        pool = list(Question.objects.filter(topic__subject=subject, is_active=True).select_related("topic__subject", "passage"))
        random.shuffle(pool)
        pools[subject.id] = pool
    while sum(allocations.values()) < limit:
        progressed = False
        for subject in subjects:
            if allocations[subject.id] < len(pools[subject.id]) and sum(allocations.values()) < limit:
                allocations[subject.id] += 1
                progressed = True
        if not progressed:
            break
    selected = []
    for subject in subjects:
        selected.extend(pools[subject.id][:allocations[subject.id]])
    return None, selected


def _challenge_state(challenge, now=None):
    now = now or timezone.now()
    if challenge.cancelled_at:
        return "cancelled"
    if now < challenge.starts_at:
        return "upcoming"
    if now >= challenge.ends_at:
        return "closed"
    return "open"


@transaction.atomic
def _award_challenge_bonuses(challenge):
    finishers = list(
        challenge.participants.select_for_update().select_related("user").filter(
            status=ChallengeParticipant.Status.COMPLETED
        ).order_by("-correct_answers", "duration_seconds", "completed_at")
    )
    if len(finishers) < 2:
        return
    now = timezone.now()
    award_date = timezone.localdate(now)
    winner_id = finishers[0].id
    for participant in finishers:
        if participant.bonus_awarded_at:
            continue
        desired = 5 + (10 if participant.id == winner_id else 0)
        awarded_today = ChallengeParticipant.objects.filter(
            user=participant.user, bonus_awarded_at__date=award_date
        ).aggregate(total=Sum("bonus_xp"))["total"] or 0
        bonus = min(desired, max(0, 30 - awarded_today))
        if bonus:
            stats, _ = UserStats.objects.select_for_update().get_or_create(user=participant.user)
            stats.xp += bonus
            stats.save(update_fields=("xp",))
        participant.bonus_xp = bonus
        participant.bonus_awarded_at = now
        participant.save(update_fields=("bonus_xp", "bonus_awarded_at"))


def challenge_payload(challenge, user):
    participants = list(challenge.participants.select_related("user").all())
    mine = next(item for item in participants if item.user_id == user.id)
    unlocked = challenge.results_unlocked
    if unlocked:
        _award_challenge_bonuses(challenge)
        participants = list(challenge.participants.select_related("user").all())
        mine = next(item for item in participants if item.user_id == user.id)
    completed = sorted(
        (item for item in participants if item.status == ChallengeParticipant.Status.COMPLETED),
        key=lambda item: (-item.correct_answers, item.duration_seconds or 10**9, item.completed_at),
    )
    positions = {item.id: index + 1 for index, item in enumerate(completed)}
    group_results = []
    if unlocked:
        for item in completed:
            recognition = "Challenge completed"
            if len(completed) >= 2 and positions[item.id] == 1:
                recognition = "Highest score"
            elif item.correct_answers == challenge.question_count:
                recognition = "Perfect paper"
            group_results.append({
                "public_id": item.user.public_id, "username": item.user.username,
                "correct": item.correct_answers, "total": challenge.question_count,
                "accuracy": item.accuracy, "duration_seconds": item.duration_seconds,
                "position": positions[item.id], "recognition": recognition, "bonus_xp": item.bonus_xp,
            })
    participant_rows = [{
        "public_id": item.user.public_id, "username": item.user.username,
        "status": item.status, "is_creator": item.user_id == challenge.creator_id,
    } for item in participants]
    my_result = None
    if mine.status == ChallengeParticipant.Status.COMPLETED:
        prior = user.attempts.exclude(session=mine.practice_session)
        prior_total = prior.count()
        prior_accuracy = round(prior.filter(is_correct=True).count() / prior_total * 100) if prior_total else None
        my_result = {
            "correct": mine.correct_answers, "total": challenge.question_count, "accuracy": mine.accuracy,
            "duration_seconds": mine.duration_seconds,
            "change_from_average": mine.accuracy - prior_accuracy if prior_accuracy is not None else None,
            "bonus_xp": mine.bonus_xp,
        }
    now = timezone.now()
    stats, _ = UserStats.objects.get_or_create(user=user)
    return {
        "id": str(challenge.id), "title": challenge.title, "message": challenge.message,
        "creator": {"public_id": challenge.creator.public_id, "username": challenge.creator.username},
        "subject": challenge.subject.slug if challenge.subject else "all", "subject_label": challenge.subject_label,
        "question_count": challenge.question_count, "duration_minutes": challenge.duration_minutes,
        "starts_at": challenge.starts_at, "ends_at": challenge.ends_at, "state": _challenge_state(challenge, now),
        "my_status": mine.status, "is_creator": challenge.creator_id == user.id,
        "can_respond": mine.status == ChallengeParticipant.Status.INVITED and now < challenge.ends_at,
        "can_start": mine.status in {ChallengeParticipant.Status.ACCEPTED, ChallengeParticipant.Status.STARTED} and challenge.starts_at <= now < challenge.ends_at,
        "results_unlocked": unlocked, "my_result": my_result,
        "participants": participant_rows, "results": group_results,
        "stats": {"xp": stats.xp, "level": stats.level, "current_streak": stats.live_current_streak, "best_streak": stats.best_streak, "last_study_date": stats.last_study_date},
    }


class StudentLookupView(APIView):
    def get(self, request):
        public_id = (request.query_params.get("id") or "").strip().upper()
        if len(public_id) != 6:
            return Response({"detail": "Enter a complete six-character Student ID."}, status=400)
        user = get_object_or_404(get_user_model(), public_id=public_id, is_active=True)
        if user.id == request.user.id:
            return Response({"detail": "You are already included as the challenge creator."}, status=400)
        return Response({"public_id": user.public_id, "username": user.username})


class ChallengeListCreateView(APIView):
    def get(self, request):
        participations = ChallengeParticipant.objects.filter(user=request.user).select_related("challenge__creator", "challenge__subject")
        return Response([challenge_payload(item.challenge, request.user) for item in participations])

    @transaction.atomic
    def post(self, request):
        title = (request.data.get("title") or "Friendly study challenge").strip()
        message = (request.data.get("message") or "").strip()
        if not 3 <= len(title) <= 100:
            return Response({"title": ["Use a title between 3 and 100 characters."]}, status=400)
        if len(message) > 280:
            return Response({"message": ["Keep the invitation message within 280 characters."]}, status=400)
        try:
            question_count = int(request.data.get("question_count", 10))
            duration_minutes = int(request.data.get("duration_minutes", 10))
        except (TypeError, ValueError):
            return Response({"detail": "Questions and time must be whole numbers."}, status=400)
        if not 10 <= question_count <= 100:
            return Response({"question_count": ["Choose between 10 and 100 questions."]}, status=400)
        if not 1 <= duration_minutes <= 180:
            return Response({"duration_minutes": ["Choose between 1 and 180 minutes."]}, status=400)
        starts_at = _aware_datetime(request.data.get("starts_at"))
        ends_at = _aware_datetime(request.data.get("ends_at"))
        now = timezone.now()
        if not starts_at or not ends_at:
            return Response({"detail": "Choose a valid start time and completion deadline."}, status=400)
        if starts_at < now - timedelta(minutes=2):
            return Response({"starts_at": ["The challenge cannot start in the past."]}, status=400)
        if ends_at <= starts_at or ends_at < starts_at + timedelta(minutes=duration_minutes):
            return Response({"ends_at": ["The challenge window must be long enough for the selected timer."]}, status=400)
        participant_ids = request.data.get("participant_ids") or []
        if not isinstance(participant_ids, list):
            return Response({"participant_ids": ["Send Student IDs as a list."]}, status=400)
        normalized_ids = list(dict.fromkeys(str(value).strip().upper() for value in participant_ids if value))
        if not 1 <= len(normalized_ids) <= 9:
            return Response({"participant_ids": ["Invite between one and nine friends."]}, status=400)
        invitees = list(get_user_model().objects.filter(public_id__in=normalized_ids, is_active=True))
        if len(invitees) != len(normalized_ids) or request.user.public_id in normalized_ids:
            return Response({"participant_ids": ["One or more Student IDs are invalid."]}, status=400)
        subject_slug = request.data.get("subject") or "all"
        subject, questions = _select_questions(subject_slug, question_count)
        if len(questions) < question_count:
            return Response({"question_count": ["The selected focus does not have enough active questions."]}, status=400)
        subject_label = subject.name if subject else "All subjects"
        challenge = Challenge.objects.create(
            creator=request.user, title=title, message=message, subject=subject, subject_label=subject_label,
            question_payload=[_question_snapshot(item) for item in questions], question_count=question_count,
            duration_minutes=duration_minutes, starts_at=starts_at, ends_at=ends_at,
        )
        ChallengeParticipant.objects.create(challenge=challenge, user=request.user, status=ChallengeParticipant.Status.ACCEPTED, responded_at=now)
        ChallengeParticipant.objects.bulk_create([ChallengeParticipant(challenge=challenge, user=user) for user in invitees])
        _record_activity(request.user, ActivityEvent.Type.CHALLENGE_CREATED, {"challenge_id": str(challenge.id), "invitees": normalized_ids})
        return Response(challenge_payload(challenge, request.user), status=status.HTTP_201_CREATED)


class ChallengeDetailView(APIView):
    def get(self, request, challenge_id):
        participation = get_object_or_404(ChallengeParticipant.objects.select_related("challenge__creator", "challenge__subject"), challenge_id=challenge_id, user=request.user)
        return Response(challenge_payload(participation.challenge, request.user))


class ChallengeRespondView(APIView):
    @transaction.atomic
    def post(self, request, challenge_id):
        # Do not join challenge__subject in this locked query. Subject is
        # nullable, and PostgreSQL rejects FOR UPDATE over that outer join.
        participant = get_object_or_404(
            ChallengeParticipant.objects.select_for_update().select_related("challenge__creator"),
            challenge_id=challenge_id,
            user=request.user,
        )
        response = request.data.get("response")
        if participant.status != ChallengeParticipant.Status.INVITED:
            return Response({"detail": "This invitation has already been answered."}, status=409)
        if timezone.now() >= participant.challenge.ends_at:
            return Response({"detail": "This challenge invitation has expired."}, status=409)
        if response not in {"accept", "decline"}:
            return Response({"response": ["Choose accept or decline."]}, status=400)
        participant.status = ChallengeParticipant.Status.ACCEPTED if response == "accept" else ChallengeParticipant.Status.DECLINED
        participant.responded_at = timezone.now()
        participant.save(update_fields=("status", "responded_at"))
        _record_activity(request.user, ActivityEvent.Type.CHALLENGE_RESPONDED, {"challenge_id": str(challenge_id), "response": response})
        return Response(challenge_payload(participant.challenge, request.user))


class ChallengeStartView(APIView):
    @transaction.atomic
    def post(self, request, challenge_id):
        # Keep the row lock on non-nullable joins only. Accessing subject later
        # as a separate query is safe and works on both PostgreSQL and SQLite.
        participant = get_object_or_404(
            ChallengeParticipant.objects.select_for_update().select_related("challenge__creator"),
            challenge_id=challenge_id,
            user=request.user,
        )
        challenge = participant.challenge
        now = timezone.now()
        if participant.status == ChallengeParticipant.Status.INVITED:
            return Response({"detail": "Accept this invitation before beginning."}, status=409)
        if participant.status == ChallengeParticipant.Status.DECLINED:
            return Response({"detail": "You declined this challenge."}, status=409)
        if now < challenge.starts_at:
            return Response({"detail": "This challenge has not opened yet."}, status=409)
        if now >= challenge.ends_at:
            return Response({"detail": "This challenge window has closed."}, status=409)
        if participant.status == ChallengeParticipant.Status.COMPLETED:
            return Response({"detail": "You have already completed this challenge."}, status=409)
        if not participant.practice_session:
            session = PracticeSession.objects.create(
                user=request.user, subject=challenge.subject, question_ids=[item["external_id"] for item in challenge.question_payload],
                total_questions=challenge.question_count, duration_minutes=challenge.duration_minutes, mode=PracticeSession.Mode.CHALLENGE,
            )
            participant.practice_session = session
            participant.status = ChallengeParticipant.Status.STARTED
            participant.started_at = now
            participant.deadline_at = min(now + timedelta(minutes=challenge.duration_minutes), challenge.ends_at)
            participant.save(update_fields=("practice_session", "status", "started_at", "deadline_at"))
            _record_activity(request.user, ActivityEvent.Type.SESSION_STARTED, {"session_id": str(session.id), "challenge_id": str(challenge.id), "subject": challenge.subject_label})
        return Response({
            "challenge_id": str(challenge.id), "session_id": str(participant.practice_session_id),
            "questions": _public_questions(challenge), "duration_minutes": challenge.duration_minutes,
            "deadline_at": participant.deadline_at, "title": challenge.title,
            "answers": {attempt.question.external_id: attempt.selected_index for attempt in participant.practice_session.attempts.select_related("question")},
        }, status=status.HTTP_201_CREATED)
