from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from .models import ActivityEvent, BadgeDefinition, ChallengeParticipant, PracticeSession, UserBadge, UserStats


BADGE_CATALOG = [
    {"code": "first-step", "name": "First Step", "description": "Complete your first practice session.", "category": "Getting started", "tier": "field", "target": 1},
    {"code": "ten-down", "name": "Ten Down", "description": "Record your first 10 answers.", "category": "Getting started", "tier": "field", "target": 10},
    {"code": "century-scholar", "name": "Century Scholar", "description": "Answer 100 questions.", "category": "Milestones", "tier": "bronze", "target": 100},
    {"code": "question-veteran", "name": "Question Veteran", "description": "Answer 500 questions.", "category": "Milestones", "tier": "gold", "target": 500},
    {"code": "three-day-flame", "name": "Three-Day Flame", "description": "Build a three-day study streak.", "category": "Consistency", "tier": "field", "target": 3},
    {"code": "week-of-focus", "name": "Week of Focus", "description": "Study for seven consecutive days.", "category": "Consistency", "tier": "bronze", "target": 7},
    {"code": "fortnight-focus", "name": "Fortnight Focus", "description": "Study for fourteen consecutive days.", "category": "Consistency", "tier": "silver", "target": 14},
    {"code": "monthly-discipline", "name": "Monthly Discipline", "description": "Maintain a thirty-day study streak.", "category": "Consistency", "tier": "gold", "target": 30},
    {"code": "clean-sheet", "name": "Clean Sheet", "description": "Score 100% in a session of at least 10 questions.", "category": "Performance", "tier": "silver", "target": 1},
    {"code": "sharp-mind", "name": "Sharp Mind", "description": "Score at least 80% in five substantial sessions.", "category": "Performance", "tier": "gold", "target": 5},
    {"code": "second-look", "name": "Second Look", "description": "Complete a saved-review session.", "category": "Learning habits", "tier": "field", "target": 1},
    {"code": "mistake-turner", "name": "Mistake Turner", "description": "Correctly revisit five questions you previously missed.", "category": "Learning habits", "tier": "silver", "target": 5},
    {"code": "balanced-learner", "name": "Balanced Learner", "description": "Record answers across every available subject.", "category": "Learning habits", "tier": "bronze", "target": 3},
    {"code": "friendly-rivalry", "name": "Friendly Rivalry", "description": "Complete your first friend challenge.", "category": "Challenges", "tier": "field", "target": 1},
    {"code": "good-sport", "name": "Good Sport", "description": "Complete ten accepted challenges, whatever the result.", "category": "Challenges", "tier": "silver", "target": 10},
    {"code": "challenge-champion", "name": "Challenge Champion", "description": "Finish first in five completed group challenges.", "category": "Challenges", "tier": "gold", "target": 5},
]


def sync_badge_catalog():
    codes = [item["code"] for item in BADGE_CATALOG]
    definitions = BadgeDefinition.objects.filter(code__in=codes).in_bulk(field_name="code")
    if len(definitions) == len(BADGE_CATALOG):
        return definitions
    for position, item in enumerate(BADGE_CATALOG, 1):
        defaults = {key: value for key, value in item.items() if key != "code"}
        badge, _ = BadgeDefinition.objects.update_or_create(
            code=item["code"],
            defaults={**defaults, "position": position, "is_active": True},
        )
        definitions[item["code"]] = badge
    return definitions


def badge_progress(user):
    attempts = user.attempts.all()
    total_attempts = attempts.count()
    completed = user.practice_sessions.filter(status=PracticeSession.Status.COMPLETED)
    strong_sessions = completed.filter(total_questions__gte=10).annotate(
        recorded_correct=Count("attempts", filter=Q(attempts__is_correct=True))
    )
    strong_count = sum(1 for session in strong_sessions if session.recorded_correct / session.total_questions >= .8)
    clean_sheet = any(session.recorded_correct == session.total_questions for session in strong_sessions)
    incorrect_ids = set(attempts.filter(is_correct=False).values_list("question_id", flat=True))
    corrected_mistakes = attempts.filter(is_correct=True, question_id__in=incorrect_ids).values("question_id").distinct().count()
    subject_count = attempts.values("question__topic__subject_id").distinct().count()
    stats, _ = UserStats.objects.get_or_create(user=user)
    completed_challenges = ChallengeParticipant.objects.filter(user=user, status=ChallengeParticipant.Status.COMPLETED)
    wins = 0
    for participation in completed_challenges.select_related("challenge"):
        if not participation.challenge.results_unlocked:
            continue
        finishers = list(participation.challenge.participants.filter(status=ChallengeParticipant.Status.COMPLETED).order_by("-correct_answers", "duration_seconds", "completed_at"))
        if len(finishers) >= 2 and finishers[0].user_id == user.id:
            wins += 1
    return {
        "first-step": completed.count(), "ten-down": total_attempts, "century-scholar": total_attempts,
        "question-veteran": total_attempts, "three-day-flame": stats.best_streak, "week-of-focus": stats.best_streak,
        "fortnight-focus": stats.best_streak, "monthly-discipline": stats.best_streak,
        "clean-sheet": int(clean_sheet), "sharp-mind": strong_count, "second-look": completed.filter(mode=PracticeSession.Mode.SAVED).count(),
        "mistake-turner": corrected_mistakes, "balanced-learner": subject_count,
        "friendly-rivalry": completed_challenges.count(), "good-sport": completed_challenges.count(), "challenge-champion": wins,
    }


@transaction.atomic
def evaluate_badges(user):
    definitions = sync_badge_catalog()
    progress = badge_progress(user)
    earned = []
    for code, badge in definitions.items():
        if progress.get(code, 0) < badge.target:
            continue
        award, created = UserBadge.objects.get_or_create(user=user, badge=badge)
        if created:
            earned.append(award)
            ActivityEvent.objects.create(user=user, event_type=ActivityEvent.Type.BADGE_EARNED, metadata={"badge": code})
    return earned


def achievements_payload(user):
    evaluate_badges(user)
    progress = badge_progress(user)
    awards = {item.badge_id: item for item in user.earned_badges.select_related("badge")}
    badges = []
    for badge in BadgeDefinition.objects.filter(is_active=True):
        award = awards.get(badge.id)
        current = min(progress.get(badge.code, 0), badge.target)
        badges.append({
            "code": badge.code, "name": badge.name, "description": badge.description,
            "category": badge.category, "tier": badge.tier, "target": badge.target,
            "current": current, "percent": round(current / badge.target * 100) if badge.target else 100,
            "earned": bool(award), "earned_at": award.earned_at if award else None,
            "unseen": bool(award and not award.seen_at),
        })
    return badges


def mark_badges_seen(user, codes=None):
    queryset = user.earned_badges.filter(seen_at__isnull=True)
    if codes:
        queryset = queryset.filter(badge__code__in=codes)
    queryset.update(seen_at=timezone.now())
