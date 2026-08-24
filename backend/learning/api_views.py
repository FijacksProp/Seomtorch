import random
import uuid

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ActivityEvent, Attempt, Bookmark, PracticeSession, Question, Subject, Topic, UserStats, QuestionComment, QuestionReport
from .serializers import AttemptSerializer, BookmarkSerializer, QuestionPracticeSerializer, SubjectSerializer, QuestionCommentSerializer, QuestionReportSerializer

def stats_payload(user):
    stats, _ = UserStats.objects.get_or_create(user=user)
    total = user.attempts.count()
    correct = user.attempts.filter(is_correct=True).count()
    return {"xp": stats.xp, "level": stats.level, "current_streak": stats.live_current_streak, "best_streak": stats.best_streak, "last_study_date": stats.last_study_date, "total_attempts": total, "accuracy": round(correct / total * 100) if total else 0}

class SubjectListView(APIView):
    def get(self, request):
        subjects = Subject.objects.filter(is_active=True).annotate(question_count=Count("topics__questions", filter=Q(topics__questions__is_active=True))).prefetch_related("topics")
        for subject in subjects:
            for topic in subject.topics.all():
                topic.question_count = topic.questions.filter(is_active=True).count()
        return Response(SubjectSerializer(subjects, many=True).data)

class StartSessionView(APIView):
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
        all_subjects = subject_slug == "all"
        saved_questions = subject_slug == "saved"
        requested_mode = request.data.get("mode", PracticeSession.Mode.TIMED)
        valid_modes = {PracticeSession.Mode.TIMED, PracticeSession.Mode.NORMAL}
        if requested_mode not in valid_modes:
            return Response({"mode": ["Choose timed or normal practice."]}, status=400)
        session_mode = PracticeSession.Mode.SAVED if saved_questions else requested_mode
        subject = None if all_subjects or saved_questions else get_object_or_404(Subject, slug=subject_slug, is_active=True)
        topic_slug = request.data.get("topic")
        topic = get_object_or_404(Topic, subject=subject, slug=topic_slug) if topic_slug and subject else None
        try: limit = int(request.data.get("limit", 10))
        except (TypeError, ValueError): limit = 10
        minimum = 1 if saved_questions else 10
        if not minimum <= limit <= 100:
            return Response({"limit": [f"Choose any number from {minimum} to 100 questions."]}, status=400)
        if requested_mode == PracticeSession.Mode.NORMAL:
            duration_minutes = None
        else:
            try: duration_minutes = int(request.data.get("duration_minutes"))
            except (TypeError, ValueError):
                return Response({"duration_minutes": ["Enter a valid study duration in minutes."]}, status=400)
            if not 1 <= duration_minutes <= 600:
                return Response({"duration_minutes": ["Study duration must be between 1 and 600 minutes."]}, status=400)

        sections = []
        if saved_questions:
            saved = list(request.user.bookmarks.select_related("question__topic__subject").order_by("-created_at")[:limit])
            if not saved:
                return Response({"detail": "Save at least one question before starting a review session."}, status=400)
            priority = {"english": 0, "mathematics": 1, "general-paper": 2}
            selected = [bookmark.question for bookmark in saved]
            selected.sort(key=lambda question: (priority.get(question.topic.subject.slug, 99), question.topic.subject.position))
            for item in selected:
                if sections and sections[-1]["subject"] == item.topic.subject.slug:
                    sections[-1]["count"] += 1
                else:
                    sections.append({"subject": item.topic.subject.slug, "name": item.topic.subject.name, "count": 1})
        elif all_subjects:
            subjects = list(Subject.objects.filter(is_active=True))
            priority = {"english": 0, "mathematics": 1, "general-paper": 2}
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
            pool = Question.objects.filter(topic__subject=subject, is_active=True)
            if topic: pool = pool.filter(topic=topic)
            selected = self._select_questions(request.user, pool, limit)
            sections.append({"subject": subject.slug, "name": subject.name, "count": len(selected)})

        session = PracticeSession.objects.create(user=request.user, subject=subject, topic=topic, question_ids=[q.external_id for q in selected], total_questions=len(selected), duration_minutes=duration_minutes, mode=session_mode)
        mode = "saved" if saved_questions else "all" if all_subjects else subject.slug
        ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.SESSION_STARTED, metadata={"session_id": str(session.id), "subject": mode, "topic": topic.slug if topic else None, "duration_minutes": duration_minutes, "sections": sections})
        return Response({"session_id": session.id, "questions": QuestionPracticeSerializer(selected, many=True).data, "sections": sections, "duration_minutes": duration_minutes}, status=status.HTTP_201_CREATED)

class SubmitAttemptView(APIView):
    @transaction.atomic
    def post(self, request):
        question = get_object_or_404(Question.objects.select_related("topic__subject"), external_id=request.data.get("question_id"), is_active=True)
        selected = request.data.get("selected_index")
        try: selected = int(selected)
        except (TypeError, ValueError): return Response({"selected_index": ["A valid option index is required."]}, status=400)
        if selected < 0 or selected >= len(question.options): return Response({"selected_index": ["Option index is out of range."]}, status=400)
        try: client_id = uuid.UUID(str(request.data.get("client_id")))
        except (TypeError, ValueError, AttributeError): return Response({"client_id": ["A valid UUID is required."]}, status=400)
        existing = Attempt.objects.filter(user=request.user, client_id=client_id).first()
        if existing: return Response(self._response(existing))
        session = None
        if request.data.get("session_id"):
            session = get_object_or_404(PracticeSession, id=request.data["session_id"], user=request.user)
            if question.external_id not in session.question_ids: return Response({"question_id": ["Question is not part of this session."]}, status=400)
        correct = selected == question.correct_index
        attempt = Attempt.objects.create(user=request.user, question=question, session=session, client_id=client_id, selected_index=selected, is_correct=correct, xp_earned=5 if correct else 0, duration_ms=request.data.get("duration_ms"))
        stats, _ = UserStats.objects.select_for_update().get_or_create(user=request.user)
        if correct: stats.register_correct_answer()
        else: stats.register_study_day()
        if session and correct:
            session.correct_answers = session.attempts.filter(is_correct=True).count()
            session.save(update_fields=("correct_answers",))
        ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.ANSWERED, metadata={"question_id": question.external_id, "subject": question.topic.subject.slug, "correct": correct, "xp": attempt.xp_earned})
        return Response(self._response(attempt), status=status.HTTP_201_CREATED)

    def _response(self, attempt):
        return {"attempt": AttemptSerializer(attempt).data, "correct": attempt.is_correct, "correct_index": attempt.question.correct_index, "explanation": attempt.question.explanation, "stats": stats_payload(attempt.user)}

class CompleteSessionView(APIView):
    def post(self, request, session_id):
        session = get_object_or_404(PracticeSession, id=session_id, user=request.user)
        session.status = PracticeSession.Status.COMPLETED
        session.completed_at = timezone.now()
        session.correct_answers = session.attempts.filter(is_correct=True).count()
        session.save(update_fields=("status", "completed_at", "correct_answers"))
        ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.SESSION_COMPLETED, metadata={"session_id": str(session.id), "accuracy": session.accuracy})
        return Response({"session_id": session.id, "correct": session.correct_answers, "total": session.total_questions, "accuracy": session.accuracy})

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
        return Response({"stats": stats_payload(request.user), "subjects": rows(subject_rows, "question__topic__subject__slug", "question__topic__subject__name"), "topics": rows(topic_rows, "question__topic__subject__slug", "question__topic__name")})

class BookmarkView(APIView):
    def get(self, request): return Response(BookmarkSerializer(request.user.bookmarks.select_related("question").order_by("-created_at"), many=True).data)
    def post(self, request):
        question = get_object_or_404(Question, external_id=request.data.get("question_id"))
        bookmark, created = Bookmark.objects.get_or_create(user=request.user, question=question)
        if created: ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.BOOKMARKED, metadata={"question_id": question.external_id})
        return Response(BookmarkSerializer(bookmark).data, status=201 if created else 200)
    def delete(self, request):
        Bookmark.objects.filter(user=request.user, question__external_id=request.data.get("question_id")).delete()
        return Response(status=204)

class QuestionCommentView(APIView):
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
        all_questions = list(Question.objects.filter(is_active=True).select_related("topic__subject", "passage"))
        if len(all_questions) < 5:
            return Response({"detail": "Not enough questions for a daily sprint."}, status=400)
        selected = rng.sample(all_questions, min(5, len(all_questions)))
        session = PracticeSession.objects.create(
            user=request.user,
            mode=PracticeSession.Mode.DAILY,
            question_ids=[question.external_id for question in selected],
            total_questions=len(selected),
            duration_minutes=5,
        )
        ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.SESSION_STARTED, metadata={"session_id": str(session.id), "subject": "daily", "duration_minutes": 5})
        return Response({
            "date": today.isoformat(),
            "session_id": session.id,
            "questions": QuestionPracticeSerializer(selected, many=True).data,
            "maximum_xp": len(selected) * 5,
        }, status=status.HTTP_201_CREATED)
