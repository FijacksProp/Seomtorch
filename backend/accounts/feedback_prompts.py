from datetime import timedelta

from django.db import transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone

from learning.models import Attempt, PracticeSession
from .models import FeedbackPromptState, StudentFeedback


@transaction.atomic
def claim_post_practice_prompt(user, session_id):
    """Reserve a prompt once across devices; never trust a client test counter."""
    now = timezone.now()
    verified = PracticeSession.objects.filter(
        user=user, status=PracticeSession.Status.COMPLETED,
    ).filter(Exists(Attempt.objects.filter(session_id=OuterRef("pk"))))
    # Reopening an old result must not be treated as finishing a new test.
    session = verified.filter(id=session_id, completed_at__gte=now - timedelta(hours=1), completed_at__lte=now).values("completed_at").first()
    if not session:
        return False
    state, _ = FeedbackPromptState.objects.select_for_update().get_or_create(user=user)
    if state.last_prompt_session == session_id:
        return False
    if state.last_prompt_at and session["completed_at"] <= state.last_prompt_at:
        return False
    if state.last_prompt_at and timezone.localdate(state.last_prompt_at) == timezone.localdate(now):
        return False
    completed = verified.count()
    if completed < state.next_test_count:
        return False
    latest_feedback = user.feedback_submissions.exclude(category=StudentFeedback.Category.SAFETY).only("created_at").first()
    if latest_feedback and verified.filter(completed_at__gt=latest_feedback.created_at).count() < 21:
        return False
    state.last_prompt_at = now
    state.last_prompt_session = session_id
    state.next_test_count = completed + 3
    state.save(update_fields=("last_prompt_at", "last_prompt_session", "next_test_count"))
    return True
