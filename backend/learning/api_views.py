import random
import uuid
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, throttling
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from monetization.models import CourseAccess, CourseTopicConfig

from .badges import achievements_payload, evaluate_badges, mark_badges_seen
from .analytics import user_test_analytics
from .models import ActivityEvent, Attempt, Bookmark, ChallengeParticipant, PracticeSession, Question, Subject, Topic, UserStats, QuestionComment, QuestionReport
from .serializers import AttemptSerializer, BookmarkSerializer, QuestionPracticeSerializer, SubjectSerializer, QuestionCommentSerializer, QuestionReportSerializer

def stats_payload(user, include_tests=True):
    stats, _ = UserStats.objects.get_or_create(user=user)
    verified_answer_xp = user.attempts.filter(is_correct=True).aggregate(total=Sum("xp_earned"))["total"] or 0
    challenge_bonus_xp = user.challenge_participations.filter(bonus_awarded_at__isnull=False).aggregate(total=Sum("bonus_xp"))["total"] or 0
    verified_xp = verified_answer_xp + challenge_bonus_xp
    if stats.xp != verified_xp:
        stats.xp = verified_xp
        stats.save(update_fields=("xp",))
    total = user.attempts.count()
    correct = user.attempts.filter(is_correct=True).count()
    payload = {"xp": stats.xp, "level": stats.level, "current_streak": stats.live_current_streak, "best_streak": stats.best_streak, "last_study_date": stats.last_study_date, "total_attempts": total, "accuracy": round(correct / total * 100) if total else 0}
    if include_tests:
        payload["tests"] = user_test_analytics(user)
    return payload


def user_can_access_topic(user, subject, topic):
    if subject.track != Subject.Track.UNIVERSITY or CourseAccess.user_has_course_access(user, subject.code):
        return True
    configured = CourseTopicConfig.objects.filter(course_code__iexact=subject.code).values_list("free_topic_id", flat=True).first()
    free_topic_id = configured or {"ANA 201": "ul-bones", "ANA 203": "week-one", "PIO 201": "transport-homeostasis"}.get(subject.code.upper(), "")
    return bool(topic and free_topic_id and topic.slug.casefold() == free_topic_id.casefold())


def user_can_access_question(user, question):
    return user_can_access_topic(user, question.topic.subject, question.topic)

class SubjectListView(APIView):
    def get(self, request):
        subjects = Subject.objects.filter(is_active=True).annotate(question_count=Count("topics__questions", filter=Q(topics__questions__is_active=True))).prefetch_related("topics")
        for subject in subjects:
            for topic in subject.topics.all():
                topic.question_count = topic.questions.filter(is_active=True).count()
        return Response(SubjectSerializer(subjects, many=True).data)

class StartSessionView(APIView):
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "practice_start"

    @staticmethod
    def _select_questions(user, pool, limit):
        seen = set(user.attempts.filter(question__in=pool).values_list("question_id", flat=True))
        unseen = list(pool.exclude(id__in=seen)); reviewed = list(pool.filter(id__in=seen))
        random.shuffle(unseen); random.shuffle(reviewed)
        return (unseen + reviewed)[:limit]

    @staticmethod
    def _balanced_counts(subjects, limit):
        available = {subject.id: Question.objects.filter(topic__subject=subject, is_active=True).count() for subject in subjects}
        allocated = {subject.id: 0 for subject in subjects}
        while sum(allocated.values()) < limit:
            progressed = False
            for subject in subjects:
                if allocated[subject.id] < available[subject.id] and sum(allocated.values()) < limit:
                    allocated[subject.id] += 1
                    progressed = True
            if not progressed:
                break
        return allocated

    def post(self, request):
        subject_slug = request.data.get("subject")
        if not isinstance(subject_slug, str) or not subject_slug.strip():
            return Response({"subject": ["Choose a valid subject."]}, status=400)
        all_subjects = subject_slug == "all"
        saved_questions = subject_slug == "saved"
        requested_mode = request.data.get("mode", PracticeSession.Mode.TIMED)
        valid_modes = {PracticeSession.Mode.TIMED, PracticeSession.Mode.NORMAL}
        if not isinstance(requested_mode, str) or requested_mode not in valid_modes:
            return Response({"mode": ["Choose timed or normal practice."]}, status=400)
        session_mode = PracticeSession.Mode.SAVED if saved_questions else requested_mode
        subject = None if all_subjects or saved_questions else get_object_or_404(Subject, slug=subject_slug, is_active=True)
        topic_slug = request.data.get("topic")
        if topic_slug is not None and not isinstance(topic_slug, str):
            return Response({"topic": ["Choose a valid topic."]}, status=400)
        topic_name = request.data.get("topic_name")
        if topic_name is not None and not isinstance(topic_name, str):
            return Response({"topic_name": ["Choose a valid topic name."]}, status=400)
        topic = None
        if topic_slug and subject:
            topic = Topic.objects.filter(subject=subject, slug=topic_slug).first()
            # Older clients derive a slug from the visible topic label. Resolve
            # by the label too, so punctuation/Unicode slug differences do not
            # turn a valid topic into a 404.
            if topic is None and topic_name and topic_name.strip():
                topic = Topic.objects.filter(subject=subject, name__iexact=topic_name.strip()).first()
            # University course catalogs and the imported bank can use slightly
            # different topic IDs. When the client supplies an explicit set of
            # questions, safely resolve the topic from that set if every ID is
            # active, belongs to this subject, and points to one topic.
            requested_topic_ids = request.data.get("question_ids")
            if topic is None and isinstance(requested_topic_ids, list) and requested_topic_ids:
                requested_ids = [str(item) for item in requested_topic_ids]
                if len(requested_ids) == len(set(requested_ids)):
                    selected_questions = Question.objects.filter(
                        external_id__in=requested_ids,
                        topic__subject=subject,
                        is_active=True,
                    )
                    selected_question_topics = list(selected_questions.values_list("external_id", "topic_id"))
                    selected_topic_ids = {topic_id for _, topic_id in selected_question_topics}
                    if len(selected_question_topics) == len(requested_ids) and len(selected_topic_ids) == 1:
                        topic = Topic.objects.filter(id=next(iter(selected_topic_ids)), subject=subject).first()
            if topic is None:
                return Response(
                    {"topic": ["This topic is not available for this subject yet. Choose another topic or All topics."]},
                    status=400,
                )
        has_course_access = bool(subject and CourseAccess.user_has_course_access(request.user, subject.code))
        if subject and subject.track == Subject.Track.UNIVERSITY and not has_course_access:
            if topic and not user_can_access_topic(request.user, subject, topic):
                return Response({"detail": "Course access is required to start this practice session."}, status=status.HTTP_403_FORBIDDEN)
            if topic is None and request.data.get("question_ids") is None:
                return Response({"detail": "Course access is required to start this practice session."}, status=status.HTTP_403_FORBIDDEN)
        raw_limit = request.data.get("limit", 10)
        if isinstance(raw_limit, bool) or isinstance(raw_limit, float) and not raw_limit.is_integer():
            return Response({"limit": ["Choose a valid number of questions."]}, status=400)
        try: limit = int(raw_limit)
        except (TypeError, ValueError): limit = 10
        minimum = 1 if saved_questions or (subject and subject.track == Subject.Track.UNIVERSITY) else 10
        if not minimum <= limit <= 100:
            return Response({"limit": [f"Choose any number from {minimum} to 100 questions."]}, status=400)
        if requested_mode == PracticeSession.Mode.NORMAL:
            duration_minutes = None
        else:
            raw_duration = request.data.get("duration_minutes")
            if isinstance(raw_duration, bool) or isinstance(raw_duration, float) and not raw_duration.is_integer():
                return Response({"duration_minutes": ["Enter a valid study duration in minutes."]}, status=400)
            try: duration_minutes = int(request.data.get("duration_minutes"))
            except (TypeError, ValueError):
                return Response({"duration_minutes": ["Enter a valid study duration in minutes."]}, status=400)
            if not 1 <= duration_minutes <= 600:
                return Response({"duration_minutes": ["Study duration must be between 1 and 600 minutes."]}, status=400)

        requested_ids = request.data.get("question_ids")
        if requested_ids is not None:
            if all_subjects or saved_questions or not isinstance(requested_ids, list) or not 1 <= len(requested_ids) <= 100:
                return Response({"question_ids": ["Provide between 1 and 100 question IDs for a single-subject session."]}, status=400)
            normalized_ids = [str(item) for item in requested_ids]
            if len(set(normalized_ids)) != len(normalized_ids) or len(normalized_ids) != limit:
                return Response({"question_ids": ["Question IDs must be unique and match the requested session length."]}, status=400)
            pool = Question.objects.filter(topic__subject=subject, is_active=True)
            if topic:
                pool = pool.filter(topic=topic)
            by_external_id = {item.external_id: item for item in pool.filter(external_id__in=normalized_ids).select_related("topic__subject")}
            if len(by_external_id) != len(normalized_ids):
                return Response({"question_ids": ["Every selected question must belong to this available subject and topic."]}, status=400)
            selected = [by_external_id[item] for item in normalized_ids]
            if subject.track == Subject.Track.UNIVERSITY and not has_course_access and any(not user_can_access_question(request.user, item) for item in selected):
                return Response({"detail": "Course access is required for one or more selected questions."}, status=status.HTTP_403_FORBIDDEN)
            sections = []
            for item in selected:
                section_name = item.topic.name if subject.track == Subject.Track.UNIVERSITY and not topic else subject.name
                section_key = item.topic.slug if subject.track == Subject.Track.UNIVERSITY and not topic else subject.slug
                if sections and sections[-1]["subject"] == section_key:
                    sections[-1]["count"] += 1
                else:
                    sections.append({"subject": section_key, "name": section_name, "count": 1})
        elif saved_questions:
            sections = []
            saved = list(request.user.bookmarks.select_related("question__topic__subject").order_by("-created_at")[:500])
            saved = [bookmark for bookmark in saved if user_can_access_question(request.user, bookmark.question)][:limit]
            if not saved:
                return Response({"detail": "Save at least one question before starting a review session."}, status=400)
            priority = {"english": 0, "mathematics": 1, "general-paper": 2, "physics": 3}
            selected = [bookmark.question for bookmark in saved]
            selected.sort(key=lambda question: (priority.get(question.topic.subject.slug, 99), question.topic.subject.position))
            for item in selected:
                if sections and sections[-1]["subject"] == item.topic.subject.slug:
                    sections[-1]["count"] += 1
                else:
                    sections.append({"subject": item.topic.subject.slug, "name": item.topic.subject.name, "count": 1})
        elif all_subjects:
            sections = []
            subjects = list(Subject.objects.filter(is_active=True, track=Subject.Track.ASPIRANT))
            priority = {"english": 0, "mathematics": 1, "general-paper": 2, "physics": 3}
            subjects.sort(key=lambda item: (priority.get(item.slug, 99), item.position, item.name))
            allocations = self._balanced_counts(subjects, limit)
            selected = []
            for item in subjects:
                count = allocations[item.id]
                if not count:
                    continue
                pool = Question.objects.filter(topic__subject=item, is_active=True)
                group = self._select_questions(request.user, pool, count)
                selected.extend(group)
                sections.append({"subject": item.slug, "name": item.name, "count": len(group)})
        else:
            sections = []
            pool = Question.objects.filter(topic__subject=subject, is_active=True)
            if topic: pool = pool.filter(topic=topic)
            selected = self._select_questions(request.user, pool, limit)
            sections.append({"subject": subject.slug, "name": subject.name, "count": len(selected)})

        if not selected:
            detail = "No active questions are available for this selection. Choose another topic or All topics."
            return Response({"detail": detail}, status=400)

        session = PracticeSession.objects.create(
            user=request.user,
            subject=subject,
            topic=topic,
            question_ids=[q.external_id for q in selected],
            total_questions=len(selected),
            duration_minutes=duration_minutes,
            mode=session_mode,
            track=subject.track if subject else "aspirant",
            course_code=subject.code if subject and subject.track == Subject.Track.UNIVERSITY else "",
            topic_title=topic.name if topic else ("Mixed practice" if subject and subject.track == Subject.Track.UNIVERSITY else ""),
        )
        mode = "saved" if saved_questions else "all" if all_subjects else subject.slug
        ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.SESSION_STARTED, metadata={"session_id": str(session.id), "subject": mode, "topic": topic.slug if topic else None, "duration_minutes": duration_minutes, "sections": sections})
        return Response({"session_id": session.id, "questions": QuestionPracticeSerializer(selected, many=True).data, "sections": sections, "duration_minutes": duration_minutes}, status=status.HTTP_201_CREATED)


class BeginSessionView(APIView):
    @transaction.atomic
    def post(self, request, session_id):
        session = get_object_or_404(
            PracticeSession.objects.select_for_update(),
            id=session_id,
            user=request.user,
        )
        if session.status != PracticeSession.Status.ACTIVE:
            return Response({"detail": "This practice session is no longer active."}, status=409)
        if session.mode in {PracticeSession.Mode.DAILY, PracticeSession.Mode.CHALLENGE}:
            return Response({"detail": "This session begins immediately when it is issued."}, status=409)
        if session.began_at is None:
            session.began_at = timezone.now()
            session.save(update_fields=("began_at",))
        return Response({"session_id": str(session.id), "began_at": session.began_at})

class SubmitAttemptView(APIView):
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "practice_answers"

    @transaction.atomic
    def post(self, request):
        question_id = request.data.get("question_id")
        if not isinstance(question_id, str):
            return Response({"question_id": ["A valid question ID is required."]}, status=400)
        question = get_object_or_404(Question.objects.select_related("topic__subject"), external_id=question_id, is_active=True)
        selected = request.data.get("selected_index")
        if isinstance(selected, bool) or isinstance(selected, float) and not selected.is_integer():
            return Response({"selected_index": ["A valid option index is required."]}, status=400)
        try: selected = int(selected)
        except (TypeError, ValueError): return Response({"selected_index": ["A valid option index is required."]}, status=400)
        if selected < 0 or selected >= len(question.options): return Response({"selected_index": ["Option index is out of range."]}, status=400)
        try: client_id = uuid.UUID(str(request.data.get("client_id")))
        except (TypeError, ValueError, AttributeError): return Response({"client_id": ["A valid UUID is required."]}, status=400)
        raw_session_id = request.data.get("session_id")
        try: session_id = uuid.UUID(str(raw_session_id))
        except (TypeError, ValueError, AttributeError):
            return Response({"session_id": ["Start a server-backed practice session before submitting an answer."]}, status=400)
        raw_duration = request.data.get("duration_ms")
        if isinstance(raw_duration, bool):
            return Response({"duration_ms": ["Enter a valid answer duration."]}, status=400)
        if raw_duration is not None:
            if isinstance(raw_duration, float) and not raw_duration.is_integer():
                return Response({"duration_ms": ["Enter a valid answer duration."]}, status=400)
            try: duration_ms = int(raw_duration)
            except (TypeError, ValueError): return Response({"duration_ms": ["Enter a valid answer duration."]}, status=400)
            if not 0 <= duration_ms <= 3600000:
                return Response({"duration_ms": ["Answer duration must be between 0 and 3600000 milliseconds."]}, status=400)
        else:
            duration_ms = None
        session = get_object_or_404(PracticeSession.objects.select_for_update(), id=session_id, user=request.user)
        existing = Attempt.objects.filter(user=request.user, client_id=client_id).first()
        if existing:
            if existing.question_id != question.id or existing.session_id != session.id or existing.selected_index != selected:
                return Response({"detail": "This answer id has already been used for a different response."}, status=409)
            return Response(self._response(existing))
        if session.status != PracticeSession.Status.ACTIVE:
            return Response({"detail": "This practice session is no longer active."}, status=409)
        if question.external_id not in session.question_ids:
            return Response({"question_id": ["Question is not part of this session."]}, status=400)
        if not session.began_at:
            return Response({"detail": "Begin this session before submitting an answer."}, status=409)
        if session.mode != PracticeSession.Mode.CHALLENGE and session.duration_minutes and timezone.now() >= session.began_at + timedelta(minutes=session.duration_minutes, seconds=90):
            return Response({"detail": "The session timer has expired."}, status=409)
        if Attempt.objects.filter(user=request.user, session=session, question=question).exists():
            return Response({"detail": "This question has already been recorded in the session."}, status=409)
        correct_index = question.correct_index
        challenge_participant = None
        if session and session.mode == PracticeSession.Mode.CHALLENGE:
            challenge_participant = get_object_or_404(ChallengeParticipant.objects.select_for_update().select_related("challenge"), practice_session=session, user=request.user)
            if challenge_participant.status != ChallengeParticipant.Status.STARTED:
                return Response({"detail": "This challenge attempt is no longer active."}, status=409)
            if timezone.now() >= challenge_participant.deadline_at + timedelta(seconds=90):
                return Response({"detail": "The challenge timer has expired."}, status=409)
            snapshot = next((item for item in challenge_participant.challenge.question_payload if item["external_id"] == question.external_id), None)
            if not snapshot:
                return Response({"detail": "This challenge question is unavailable."}, status=409)
            correct_index = snapshot["correct"]
            if session.attempts.filter(question=question).exists():
                return Response({"detail": "This challenge question has already been recorded."}, status=409)
        correct = selected == correct_index
        attempt = Attempt.objects.create(user=request.user, question=question, session=session, client_id=client_id, selected_index=selected, is_correct=correct, xp_earned=5 if correct else 0, duration_ms=duration_ms)
        stats, _ = UserStats.objects.select_for_update().get_or_create(user=request.user)
        if correct: stats.register_correct_answer()
        else: stats.register_study_day()
        if session and correct:
            session.correct_answers = session.attempts.filter(is_correct=True).count()
            session.save(update_fields=("correct_answers",))
        ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.ANSWERED, metadata={"question_id": question.external_id, "subject": question.topic.subject.slug, "correct": correct, "xp": attempt.xp_earned})
        payload = self._response(attempt)
        payload["badges_earned"] = []
        return Response(payload, status=status.HTTP_201_CREATED)

    def _response(self, attempt):
        if attempt.session and attempt.session.mode == PracticeSession.Mode.CHALLENGE:
            return {
                "attempt": {"client_id": attempt.client_id, "question_id": attempt.question.external_id, "selected_index": attempt.selected_index, "answered_at": attempt.answered_at},
                "accepted": True,
                "stats": stats_payload(attempt.user, include_tests=False),
            }
        return {"attempt": AttemptSerializer(attempt).data, "correct": attempt.is_correct, "correct_index": attempt.question.correct_index, "explanation": attempt.question.explanation, "explanation_status": attempt.question.explanation_status, "explanation_image_url": attempt.question.explanation_image_url, "stats": stats_payload(attempt.user, include_tests=False)}


class BulkSubmitAttemptsView(APIView):
    """Record a finished timed session's deferred answers in one round trip."""
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "practice_answers"

    @transaction.atomic
    def post(self, request):
        raw_session_id = request.data.get("session_id")
        try:
            session_id = uuid.UUID(str(raw_session_id))
        except (TypeError, ValueError, AttributeError):
            return Response({"session_id": ["Start a server-backed practice session before submitting answers."]}, status=400)

        raw_items = request.data.get("attempts")
        if not isinstance(raw_items, list) or not 1 <= len(raw_items) <= 100:
            return Response({"attempts": ["Submit between 1 and 100 selected answers."]}, status=400)

        parsed = []
        client_ids = set()
        question_ids = set()
        for index, item in enumerate(raw_items):
            if not isinstance(item, dict):
                return Response({"attempts": [f"Answer {index + 1} is invalid."]}, status=400)
            question_id = item.get("question_id")
            if not isinstance(question_id, str) or not question_id:
                return Response({"attempts": [f"Answer {index + 1} needs a valid question ID."]}, status=400)
            try:
                client_id = uuid.UUID(str(item.get("client_id")))
            except (TypeError, ValueError, AttributeError):
                return Response({"attempts": [f"Answer {index + 1} needs a valid response ID."]}, status=400)
            selected = item.get("selected_index")
            if isinstance(selected, bool) or isinstance(selected, float) and not selected.is_integer():
                return Response({"attempts": [f"Answer {index + 1} has an invalid option."]}, status=400)
            try:
                selected = int(selected)
            except (TypeError, ValueError):
                return Response({"attempts": [f"Answer {index + 1} has an invalid option."]}, status=400)
            raw_duration = item.get("duration_ms")
            if isinstance(raw_duration, bool) or isinstance(raw_duration, float) and not raw_duration.is_integer():
                return Response({"attempts": [f"Answer {index + 1} has an invalid duration."]}, status=400)
            try:
                duration_ms = None if raw_duration is None else int(raw_duration)
            except (TypeError, ValueError):
                return Response({"attempts": [f"Answer {index + 1} has an invalid duration."]}, status=400)
            if duration_ms is not None and not 0 <= duration_ms <= 3600000:
                return Response({"attempts": [f"Answer {index + 1} has an invalid duration."]}, status=400)
            if client_id in client_ids or question_id in question_ids:
                return Response({"attempts": ["Each question and response ID must appear only once."]}, status=400)
            client_ids.add(client_id)
            question_ids.add(question_id)
            parsed.append({"question_id": question_id, "client_id": client_id, "selected_index": selected, "duration_ms": duration_ms})

        session = get_object_or_404(PracticeSession.objects.select_for_update(), id=session_id, user=request.user)
        if session.mode == PracticeSession.Mode.CHALLENGE:
            return Response({"detail": "Challenge answers must be submitted through the challenge flow."}, status=409)
        if session.status != PracticeSession.Status.ACTIVE:
            return Response({"detail": "This practice session is no longer active."}, status=409)
        if not session.began_at:
            return Response({"detail": "Begin this session before submitting answers."}, status=409)
        if session.duration_minutes and timezone.now() >= session.began_at + timedelta(minutes=session.duration_minutes, seconds=90):
            return Response({"detail": "The session timer has expired."}, status=409)

        questions = {
            item.external_id: item
            for item in Question.objects.filter(external_id__in=question_ids, is_active=True).select_related("topic__subject")
        }
        if len(questions) != len(parsed):
            return Response({"attempts": ["One or more questions are no longer available."]}, status=400)
        if not question_ids.issubset(set(session.question_ids)):
            return Response({"attempts": ["Every answer must belong to this practice session."]}, status=400)
        for item in parsed:
            question = questions[item["question_id"]]
            if item["selected_index"] < 0 or item["selected_index"] >= len(question.options):
                return Response({"attempts": ["An answer option is out of range."]}, status=400)

        prior_by_client = {
            str(attempt.client_id): attempt
            for attempt in Attempt.objects.filter(user=request.user, client_id__in=client_ids).select_related("question__topic__subject", "session")
        }
        prior_in_session = {
            attempt.question.external_id: attempt
            for attempt in Attempt.objects.filter(user=request.user, session=session, question__external_id__in=question_ids).select_related("question__topic__subject")
        }
        new_items = []
        response_attempts = {}
        for item in parsed:
            question = questions[item["question_id"]]
            prior = prior_by_client.get(str(item["client_id"]))
            if prior:
                if prior.question_id != question.id or prior.session_id != session.id or prior.selected_index != item["selected_index"]:
                    return Response({"detail": "A response ID has already been used for a different answer."}, status=409)
                response_attempts[str(item["client_id"])] = prior
                continue
            prior_question = prior_in_session.get(question.external_id)
            if prior_question:
                return Response({"detail": "This question has already been recorded in the session."}, status=409)
            correct = item["selected_index"] == question.correct_index
            attempt = Attempt(
                user=request.user,
                question=question,
                session=session,
                client_id=item["client_id"],
                selected_index=item["selected_index"],
                is_correct=correct,
                xp_earned=5 if correct else 0,
                duration_ms=item["duration_ms"],
            )
            new_items.append((item, question, attempt))

        created = Attempt.objects.bulk_create([row[2] for row in new_items])
        response_attempts.update({str(attempt.client_id): attempt for attempt in created})
        ActivityEvent.objects.bulk_create([
            ActivityEvent(user=request.user, event_type=ActivityEvent.Type.ANSWERED, metadata={
                "question_id": question.external_id,
                "subject": question.topic.subject.slug,
                "correct": attempt.is_correct,
                "xp": attempt.xp_earned,
            })
            for _, question, attempt in new_items
        ])

        if new_items:
            stats, _ = UserStats.objects.select_for_update().get_or_create(user=request.user)
            correct_count = sum(1 for _, _, attempt in new_items if attempt.is_correct)
            stats.xp += correct_count * 5
            today = timezone.localdate()
            if stats.last_study_date != today:
                from datetime import timedelta as date_timedelta
                stats.current_streak = stats.current_streak + 1 if stats.last_study_date == today - date_timedelta(days=1) else 1
                stats.best_streak = max(stats.best_streak, stats.current_streak)
                stats.last_study_date = today
            stats.save()
            session.correct_answers = session.attempts.filter(is_correct=True).count()
            session.save(update_fields=("correct_answers",))

        results = []
        for item in parsed:
            attempt = response_attempts[str(item["client_id"])]
            question = attempt.question
            results.append({
                "client_id": str(attempt.client_id),
                "question_id": question.external_id,
                "correct": attempt.is_correct,
                "correct_index": question.correct_index,
                "explanation": question.explanation,
                "explanation_status": question.explanation_status,
                "explanation_image_url": question.explanation_image_url,
            })
        return Response({"results": results, "stats": stats_payload(request.user, include_tests=False), "badges_earned": []})

class CompleteSessionView(APIView):
    @transaction.atomic
    def post(self, request, session_id):
        session = get_object_or_404(PracticeSession, id=session_id, user=request.user)
        if session.status == PracticeSession.Status.COMPLETED:
            return Response({"session_id": session.id, "correct": session.attempts.filter(is_correct=True).count(), "total": session.total_questions, "accuracy": session.accuracy, "challenge_id": None, "stats": stats_payload(request.user), "badges_earned": []})
        if session.status != PracticeSession.Status.ACTIVE:
            return Response({"detail": "This practice session cannot be completed."}, status=409)
        if not session.began_at:
            return Response({"detail": "Begin this session before completing it."}, status=409)
        if not session.attempts.exists():
            session.status = PracticeSession.Status.ABANDONED
            session.save(update_fields=("status",))
            return Response({
                "session_id": str(session.id),
                "status": session.status,
                "correct": 0,
                "total": session.total_questions,
                "accuracy": 0,
                "stats": stats_payload(request.user),
                "badges_earned": [],
            })
        session.status = PracticeSession.Status.COMPLETED
        session.completed_at = timezone.now()
        session.correct_answers = session.attempts.filter(is_correct=True).count()
        session.save(update_fields=("status", "completed_at", "correct_answers"))
        challenge_id = None
        if session.mode == PracticeSession.Mode.CHALLENGE:
            participant = get_object_or_404(ChallengeParticipant.objects.select_for_update().select_related("challenge"), practice_session=session, user=request.user)
            if participant.status != ChallengeParticipant.Status.COMPLETED:
                participant.status = ChallengeParticipant.Status.COMPLETED
                participant.completed_at = session.completed_at
                participant.correct_answers = session.correct_answers
                participant.answered_questions = session.attempts.count()
                participant.duration_seconds = max(1, int((session.completed_at - participant.started_at).total_seconds()))
                participant.save(update_fields=("status", "completed_at", "correct_answers", "answered_questions", "duration_seconds"))
                ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.CHALLENGE_COMPLETED, metadata={"challenge_id": str(participant.challenge_id), "score": participant.correct_answers})
            challenge_id = str(participant.challenge_id)
        ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.SESSION_COMPLETED, metadata={"session_id": str(session.id), "accuracy": session.accuracy})
        earned = evaluate_badges(request.user)
        return Response({"session_id": session.id, "correct": session.correct_answers, "total": session.total_questions, "accuracy": session.accuracy, "challenge_id": challenge_id, "stats": stats_payload(request.user), "badges_earned": [{"code": item.badge.code, "name": item.badge.name, "description": item.badge.description, "tier": item.badge.tier} for item in earned]})

class AttemptSyncView(APIView):
    def get(self, request):
        attempts = request.user.attempts.select_related("question__topic__subject")[:5000]
        return Response({"attempts": AttemptSerializer(attempts, many=True).data, "stats": stats_payload(request.user)})

    def post(self, request):
        return SubmitAttemptView().post(request)

class ProgressView(APIView):
    def get(self, request):
        attempts = request.user.attempts
        subject_rows = attempts.values("question__topic__subject__slug", "question__topic__subject__name").annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True))).order_by("question__topic__subject__position")
        topic_rows = attempts.values("question__topic__subject__slug", "question__topic__name").annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True))).order_by("question__topic__subject__slug", "question__topic__name")
        def rows(values, subject_key, name_key):
            return [{"subject": row[subject_key], "name": row[name_key], "total": row["total"], "correct": row["correct"], "accuracy": round(row["correct"] / row["total"] * 100)} for row in values]
        return Response({"stats": stats_payload(request.user), "tests": user_test_analytics(request.user, include_recent=True), "subjects": rows(subject_rows, "question__topic__subject__slug", "question__topic__subject__name"), "topics": rows(topic_rows, "question__topic__subject__slug", "question__topic__name")})

class BookmarkView(APIView):
    def get(self, request): return Response(BookmarkSerializer(request.user.bookmarks.select_related("question").order_by("-created_at"), many=True).data)
    def post(self, request):
        question = get_object_or_404(Question, external_id=request.data.get("question_id"))
        if not user_can_access_question(request.user, question):
            return Response({"detail": "Course access is required to save this question."}, status=status.HTTP_403_FORBIDDEN)
        bookmark, created = Bookmark.objects.get_or_create(user=request.user, question=question)
        if created: ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.BOOKMARKED, metadata={"question_id": question.external_id})
        return Response(BookmarkSerializer(bookmark).data, status=201 if created else 200)
    def delete(self, request):
        Bookmark.objects.filter(user=request.user, question__external_id=request.data.get("question_id")).delete()
        return Response(status=204)

class QuestionCommentView(APIView):
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "question_write"

    def get(self, request, question_id):
        question = get_object_or_404(Question, external_id=question_id, is_active=True)
        comments = question.comments.select_related("user").all()[:100]
        return Response(QuestionCommentSerializer(comments, many=True).data)

    def post(self, request, question_id):
        question = get_object_or_404(Question, external_id=question_id, is_active=True)
        text = (request.data.get("text") or "").strip()
        if not text or len(text) > 2000:
            return Response({"text": ["Comment must be between 1 and 2000 characters."]}, status=400)
        comment = QuestionComment.objects.create(question=question, user=request.user, text=text)
        return Response(QuestionCommentSerializer(comment).data, status=201)

class QuestionReportView(APIView):
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "question_write"

    def post(self, request, question_id):
        question = get_object_or_404(Question, external_id=question_id, is_active=True)
        reason = request.data.get("reason", "")
        valid_reasons = [c[0] for c in QuestionReport.Reason.choices]
        if reason not in valid_reasons:
            return Response({"reason": [f"Choose one of: {', '.join(valid_reasons)}"]}, status=400)
        details = (request.data.get("details") or "").strip()
        report, created = QuestionReport.objects.get_or_create(
            user=request.user, question=question, reason=reason,
            defaults={"details": details}
        )
        if not created:
            return Response({"detail": "You have already reported this issue."}, status=409)
        return Response(QuestionReportSerializer(report).data, status=201)

class DailySprintView(APIView):
    @transaction.atomic
    def post(self, request):
        import hashlib
        today = timezone.localdate()
        if PracticeSession.objects.filter(user=request.user, mode=PracticeSession.Mode.DAILY, started_at__date=today).exists():
            return Response({"detail": "Today's sprint has already been started."}, status=409)
        seed = hashlib.sha256(f"seomtorch-sprint-{today.isoformat()}-{request.user.public_id}".encode()).hexdigest()
        rng = random.Random(seed)
        all_questions = list(Question.objects.filter(
            is_active=True,
            topic__subject__track=Subject.Track.ASPIRANT,
        ).select_related("topic__subject", "passage"))
        if len(all_questions) < 5:
            return Response({"detail": "Not enough questions for a daily sprint."}, status=400)
        selected = rng.sample(all_questions, min(5, len(all_questions)))
        began_at = timezone.now()
        session = PracticeSession.objects.create(
            user=request.user,
            mode=PracticeSession.Mode.DAILY,
            began_at=began_at,
            question_ids=[question.external_id for question in selected],
            total_questions=len(selected),
            duration_minutes=5,
        )
        ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.SESSION_STARTED, metadata={"session_id": str(session.id), "subject": "daily", "duration_minutes": 5})
        return Response({
            "date": today.isoformat(),
            "session_id": session.id,
            "began_at": began_at,
            "questions": QuestionPracticeSerializer(selected, many=True).data,
            "maximum_xp": len(selected) * 5,
        }, status=status.HTTP_201_CREATED)


class AchievementView(APIView):
    def get(self, request):
        badges = achievements_payload(request.user)
        return Response({"badges": badges, "earned_count": sum(1 for item in badges if item["earned"]), "total_count": len(badges)})

    def post(self, request):
        codes = request.data.get("codes")
        mark_badges_seen(request.user, codes if isinstance(codes, list) else None)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RecordSessionView(APIView):
    """Reject browser-reported scores; use server-created sessions instead."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(
            {"detail": "Browser-reported scores are no longer accepted. Begin a server-backed practice session and submit its answers."},
            status=status.HTTP_410_GONE,
        )


RecordUniversitySessionView = RecordSessionView
