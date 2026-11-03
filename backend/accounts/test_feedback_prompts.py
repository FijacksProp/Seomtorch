import uuid
from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from learning.models import Attempt, PracticeSession, Question, Subject, Topic
from .models import FeedbackPromptState, StudentFeedback


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class FeedbackPromptTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(email="feedback-prompt@example.com", username="feedback-prompt", password="TestOnly123!")
        cls.other = get_user_model().objects.create_user(email="feedback-other@example.com", username="feedback-other", password="TestOnly123!")
        subject = Subject.objects.get(slug="english")
        topic = Topic.objects.create(subject=subject, slug="feedback-prompt", name="Feedback prompt fixture")
        cls.question = Question.objects.create(external_id="feedback-prompt-fixture", topic=topic, text="Test?", options=["A", "B"], correct_index=0)

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.user)

    def complete(self, count, user=None, at=None):
        at = at or timezone.now()
        sessions = PracticeSession.objects.bulk_create([
            PracticeSession(
                user=user or self.user, status=PracticeSession.Status.COMPLETED,
                completed_at=at, began_at=at - timedelta(minutes=1),
                total_questions=10, question_ids=[self.question.external_id],
            ) for _ in range(count)
        ])
        Attempt.objects.bulk_create([
            Attempt(user=user or self.user, session=session, question=self.question, selected_index=0, is_correct=True, xp_earned=5)
            for session in sessions
        ])
        return sessions[-1]

    def claim(self, session):
        result = self.client.post("/api/community/feedback-prompt/", {"session_id": str(session.id)}, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        return result.data["show"]

    def feedback(self):
        response = self.client.post("/api/community/feedback/", {
            "body": "Please improve the notebook search.", "category": "improvement", "client_id": str(uuid.uuid4()),
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)

    def test_first_prompt_requires_three_verified_tests(self):
        self.assertFalse(self.claim(self.complete(2)))
        third = self.complete(1)
        self.assertTrue(self.claim(third))
        state = FeedbackPromptState.objects.get(user=self.user)
        self.assertEqual(state.next_test_count, 6)
        self.assertEqual(state.last_prompt_session, third.id)

    def test_daily_cap_is_shared_across_browsers(self):
        self.assertTrue(self.claim(self.complete(3)))
        sixth = self.complete(3)
        another_browser = APIClient()
        another_browser.force_authenticate(self.user)
        response = another_browser.post("/api/community/feedback-prompt/", {"session_id": str(sixth.id)}, format="json")
        self.assertFalse(response.data["show"])
        state = FeedbackPromptState.objects.get(user=self.user)
        state.last_prompt_at -= timedelta(days=1)
        state.save()
        self.assertTrue(self.claim(sixth))

    def test_at_least_three_new_tests_are_required_between_prompts(self):
        self.assertTrue(self.claim(self.complete(3)))
        FeedbackPromptState.objects.filter(user=self.user).update(last_prompt_at=timezone.now() - timedelta(days=1))
        self.assertFalse(self.claim(self.complete(2)))
        self.assertTrue(self.claim(self.complete(1)))

    def test_feedback_submission_suppresses_twenty_tests_then_allows_the_twenty_first(self):
        self.complete(3)
        self.feedback()
        self.assertFalse(self.claim(self.complete(20)))
        self.assertTrue(self.claim(self.complete(1)))

    def test_each_new_feedback_submission_restarts_the_long_cooldown(self):
        self.complete(3)
        self.feedback()
        self.complete(20)
        self.feedback()
        self.assertFalse(self.claim(self.complete(20)))
        self.assertTrue(self.claim(self.complete(1)))

    def test_safety_reports_are_not_app_feedback(self):
        StudentFeedback.objects.create(user=self.user, category="safety", body="A safety report")
        self.assertTrue(self.claim(self.complete(3)))

    def test_empty_unfinished_abandoned_and_foreign_sessions_do_not_qualify(self):
        self.complete(3)
        empty = PracticeSession.objects.create(user=self.user, status="completed", completed_at=timezone.now(), total_questions=10)
        self.assertFalse(self.claim(empty))
        for status in ("active", "abandoned"):
            session = self.complete(1)
            session.status = status
            session.save()
            self.assertFalse(self.claim(session))
        self.assertFalse(self.claim(self.complete(3, user=self.other)))

    def test_reopening_old_results_does_not_trigger_a_prompt(self):
        old = self.complete(3, at=timezone.now() - timedelta(days=2))
        self.complete(3)
        self.assertFalse(self.claim(old))

    def test_retries_do_not_consume_another_milestone(self):
        session = self.complete(3)
        self.assertTrue(self.claim(session))
        self.assertFalse(self.claim(session))
        self.assertEqual(FeedbackPromptState.objects.get(user=self.user).next_test_count, 6)

    def test_daily_cap_uses_the_apps_lagos_calendar_day(self):
        first = datetime(2026, 11, 3, 22, 30, tzinfo=dt_timezone.utc)
        second = first + timedelta(hours=1)  # Still 3 Nov UTC, now 4 Nov in Lagos.
        with patch("accounts.feedback_prompts.timezone.now", return_value=first):
            previous = self.complete(3, at=first)
            self.assertTrue(self.claim(previous))
            other_old_result = self.user.practice_sessions.exclude(id=previous.id).first()
        with patch("accounts.feedback_prompts.timezone.now", return_value=second):
            fresh = self.complete(3, at=second)
            self.assertFalse(self.claim(other_old_result))
            self.assertTrue(self.claim(fresh))

    def test_invalid_and_anonymous_requests_cannot_claim(self):
        self.assertEqual(self.client.post("/api/community/feedback-prompt/", {"session_id": "invalid"}, format="json").status_code, 400)
        self.client.force_authenticate(None)
        self.assertIn(self.client.post("/api/community/feedback-prompt/", {"session_id": str(uuid.uuid4())}, format="json").status_code, (401, 403))
