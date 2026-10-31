from collections import defaultdict
from statistics import mean

from django.db.models import Count, Q
from django.utils import timezone

from .models import ChallengeParticipant, PracticeSession


def _focus_for(session):
    if getattr(session, "course_code", None):
        title = session.topic_title or (session.subject.name if session.subject else session.course_code)
        return session.course_code.lower().replace(" ", "-"), f"{session.course_code} ({title})"
    if session.subject_id:
        return session.subject.slug, session.subject.name
    if session.mode == PracticeSession.Mode.SAVED:
        return "saved", "Saved review"
    if session.mode == PracticeSession.Mode.DAILY:
        return "daily", "Daily sprint"
    if session.mode == PracticeSession.Mode.CHALLENGE:
        try:
            challenge = session.challenge_participation.challenge
            return challenge.subject.slug if challenge.subject_id else "all", challenge.subject_label
        except ChallengeParticipant.DoesNotExist:
            return "challenge", "Friend challenge"
    return "all", "All subjects"


def completed_session_queryset(queryset):
    return (
        queryset.filter(status=PracticeSession.Status.COMPLETED)
        .select_related("subject", "challenge_participation__challenge__subject")
        .annotate(
            answered_count=Count("attempts", distinct=True),
            recorded_correct=Count("attempts", filter=Q(attempts__is_correct=True), distinct=True),
        )
        .order_by("-completed_at")
    )


def session_analytics(queryset, include_recent=False):
    sessions = list(completed_session_queryset(queryset))
    scores = []
    mode_groups = defaultdict(list)
    focus_groups = defaultdict(lambda: {"name": "", "scores": [], "questions": 0})
    records = []
    for session in sessions:
        correct = session.recorded_correct if session.answered_count > 0 else session.correct_answers
        answered = session.answered_count if session.answered_count > 0 else session.total_questions
        score = round(correct / session.total_questions * 100) if session.total_questions else 0
        scores.append(score)
        mode_groups[session.mode].append(score)
        focus_key, focus_name = _focus_for(session)
        focus_groups[focus_key]["name"] = focus_name
        focus_groups[focus_key]["scores"].append(score)
        focus_groups[focus_key]["questions"] += answered
        records.append({
            "id": str(session.id), "mode": session.mode, "mode_label": session.get_mode_display(),
            "focus": focus_name, "score": score, "correct": correct,
            "answered": answered, "total": session.total_questions,
            "completed_at": session.completed_at,
            "duration_minutes": session.duration_minutes,
            "track": getattr(session, "track", "aspirant"),
            "course_code": getattr(session, "course_code", ""),
        })
    started = queryset.count()
    completed = len(sessions)
    newest = scores[:3]
    previous = scores[3:6]
    improvement = round(mean(newest) - mean(previous)) if len(newest) == 3 and len(previous) == 3 else None
    payload = {
        "tests_taken": completed,
        "tests_today": sum(1 for item in sessions if item.completed_at and timezone.localdate(item.completed_at) == timezone.localdate()),
        "in_progress": queryset.filter(status=PracticeSession.Status.ACTIVE).count(),
        "unfinished": queryset.exclude(status=PracticeSession.Status.COMPLETED).count(),
        "completion_rate": round(completed / started * 100) if started else 0,
        "average_score": round(mean(scores)) if scores else 0,
        "best_score": max(scores, default=0),
        "improvement": improvement,
        "questions_in_tests": sum(item.answered_count for item in sessions),
        "by_mode": [
            {"mode": mode, "label": dict(PracticeSession.Mode.choices).get(mode, mode.title()), "count": len(values), "average_score": round(mean(values))}
            for mode, values in mode_groups.items()
        ],
        "by_focus": [
            {"focus": key, "name": data["name"], "count": len(data["scores"]), "average_score": round(mean(data["scores"])), "questions": data["questions"]}
            for key, data in focus_groups.items()
        ],
    }
    if include_recent:
        payload["recent_tests"] = records[:10]
        payload["trend"] = list(reversed([{"score": item["score"], "completed_at": item["completed_at"], "focus": item["focus"]} for item in records[:8]]))
    return payload


def user_test_analytics(user, include_recent=False):
    return session_analytics(user.practice_sessions.all(), include_recent=include_recent)
