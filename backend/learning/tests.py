import uuid
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase
from django.utils import timezone

from .models import ActivityEvent, Attempt, Bookmark, Challenge, ChallengeParticipant, PracticeSession, Question, Subject, Topic, UserBadge, UserStats
from .badges import BADGE_CATALOG, badge_progress

class LearningApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Keep API tests fast and deterministic; the production question bank
        # is hundreds of megabytes and is validated separately at import time.
        sample_subjects = [
            ("english", "English Language", 1, 120),
            ("mathematics", "Mathematics", 2, 20),
            ("general-paper", "General Paper", 3, 20),
            ("physics", "Physics", 4, 20),
        ]
        questions = []
        for slug, name, position, count in sample_subjects:
            subject, _ = Subject.objects.get_or_create(
                slug=slug,
                defaults={"name": name, "position": position, "track": Subject.Track.ASPIRANT},
            )
            topic, _ = Topic.objects.get_or_create(
                subject=subject, slug="general-practice", defaults={"name": "General Practice"},
            )
            questions.extend(
                Question(
                    external_id=f"test-{slug}-{index:03d}", topic=topic,
                    text=f"{name} sample question {index + 1}",
                    options=["Option A", "Option B", "Option C", "Option D"],
                    correct_index=0,
                    explanation="The first option is the correct answer in this test fixture.",
                )
                for index in range(count)
            )
        Question.objects.bulk_create(questions)
        cls.user = get_user_model().objects.create_user(email="learner@example.com", username="learner", password="Securepass934!")
        cls.token = Token.objects.create(user=cls.user)

    def setUp(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def _new_started_session(self, subject_slug="english", limit=10, mode="timed"):
        started = self.client.post("/api/sessions/", {
            "subject": subject_slug,
            "limit": limit,
            "duration_minutes": 30 if mode != "normal" else None,
            "mode": mode,
        }, format="json")
        self.assertEqual(started.status_code, 201, started.data)
        session_id = started.data["session_id"]
        began = self.client.post(f"/api/sessions/{session_id}/begin/", {}, format="json")
        self.assertEqual(began.status_code, 200, began.data)
        question = Question.objects.get(external_id=started.data["questions"][0]["external_id"])
        return started, PracticeSession.objects.get(id=session_id), question

    def _submit_answer(self, session, question, selected_index=None, client_id=None):
        return self.client.post("/api/attempts/", {
            "question_id": question.external_id,
            "selected_index": question.correct_index if selected_index is None else selected_index,
            "client_id": str(client_id or uuid.uuid4()),
            "session_id": str(session.id),
        }, format="json")

    def test_correct_answer_awards_five_xp(self):
        _, session, question = self._new_started_session()
        response = self._submit_answer(session, question)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["attempt"]["xp_earned"], 5)
        self.assertEqual(response.data["stats"]["xp"], 5)

    def test_incorrect_answer_awards_no_xp(self):
        _, session, question = self._new_started_session()
        wrong = (question.correct_index + 1) % len(question.options)
        response = self._submit_answer(session, question, selected_index=wrong)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["attempt"]["xp_earned"], 0)
        self.assertEqual(response.data["stats"]["xp"], 0)

    def test_bulk_submission_records_answers_and_is_idempotent(self):
        _, session, _ = self._new_started_session(limit=10)
        selected = list(Question.objects.filter(external_id__in=session.question_ids).order_by("external_id")[:2])
        payload = {
            "session_id": str(session.id),
            "attempts": [
                {
                    "question_id": question.external_id,
                    "selected_index": question.correct_index if index == 0 else (question.correct_index + 1) % len(question.options),
                    "client_id": str(uuid.uuid4()),
                }
                for index, question in enumerate(selected)
            ],
        }

        first = self.client.post("/api/attempts/bulk/", payload, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(len(first.data["results"]), 2)
        self.assertEqual([item["correct"] for item in first.data["results"]], [True, False])
        self.assertEqual(first.data["stats"]["xp"], 5)
        self.assertEqual(Attempt.objects.filter(user=self.user, session=session).count(), 2)
        self.assertEqual(ActivityEvent.objects.filter(user=self.user, event_type=ActivityEvent.Type.ANSWERED).count(), 2)

        retry = self.client.post("/api/attempts/bulk/", payload, format="json")
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(Attempt.objects.filter(user=self.user, session=session).count(), 2)
        self.assertEqual(retry.data["stats"]["xp"], 5)

    def test_bulk_submission_rejects_answers_outside_the_session(self):
        _, session, _ = self._new_started_session(limit=10)
        outside = Question.objects.exclude(external_id__in=session.question_ids).filter(topic__subject__slug="english").first()
        response = self.client.post("/api/attempts/bulk/", {
            "session_id": str(session.id),
            "attempts": [{
                "question_id": outside.external_id,
                "selected_index": 0,
                "client_id": str(uuid.uuid4()),
            }],
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Attempt.objects.filter(user=self.user, session=session).exists())

    def test_duplicate_client_attempt_is_idempotent(self):
        _, session, question = self._new_started_session()
        client_id = str(uuid.uuid4())
        self._submit_answer(session, question, client_id=client_id)
        response = self._submit_answer(session, question, client_id=client_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Attempt.objects.filter(user=self.user).count(), 1)
        self.assertEqual(UserStats.objects.get(user=self.user).xp, 5)

    def test_answer_cannot_be_recorded_before_session_begins(self):
        started = self.client.post("/api/sessions/", {"subject": "english", "limit": 10, "duration_minutes": 10}, format="json")
        self.assertEqual(started.status_code, 201)
        question = Question.objects.get(external_id=started.data["questions"][0]["external_id"])
        session = PracticeSession.objects.get(id=started.data["session_id"])
        response = self._submit_answer(session, question)
        self.assertEqual(response.status_code, 409)
        self.assertFalse(Attempt.objects.filter(user=self.user).exists())

    def test_session_accepts_supported_hundred_question_length(self):
        response = self.client.post("/api/sessions/", {"subject": "english", "limit": 100, "duration_minutes": 45}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["questions"]), 100)

    def test_session_accepts_every_count_between_ten_and_hundred(self):
        response = self.client.post("/api/sessions/", {"subject": "english", "limit": 37, "duration_minutes": 18}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["questions"]), 37)

    def test_normal_session_is_untimed_and_does_not_expose_answers(self):
        response = self.client.post("/api/sessions/", {"subject": "english", "limit": 12, "mode": "normal"}, format="json")
        self.assertEqual(response.status_code, 201)
        session = self.user.practice_sessions.first()
        self.assertEqual(session.mode, "normal")
        self.assertIsNone(session.duration_minutes)
        self.assertNotIn("correct_index", response.data["questions"][0])
        self.assertNotIn("explanation", response.data["questions"][0])

    def test_timed_session_records_its_mode(self):
        response = self.client.post("/api/sessions/", {"subject": "english", "limit": 10, "duration_minutes": 10, "mode": "timed"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.user.practice_sessions.first().mode, "timed")

    def test_session_rejects_out_of_range_length(self):
        response = self.client.post("/api/sessions/", {"subject": "english", "limit": 9, "duration_minutes": 10}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_session_resolves_topic_by_name_when_client_slug_differs(self):
        subject = Subject.objects.get(slug="physics")
        topic = Topic.objects.create(subject=subject, name="Motion/Projectile", slug="motionprojectile")
        Question.objects.bulk_create([
            Question(
                external_id=f"topic-slug-fallback-{index}",
                topic=topic,
                text=f"Topic slug fallback question {index}",
                options=["Option A", "Option B", "Option C", "Option D"],
                correct_index=0,
            )
            for index in range(10)
        ])

        response = self.client.post("/api/sessions/", {
            "subject": "physics",
            "topic": "motion-projectile",
            "topic_name": "Motion/Projectile",
            "limit": 10,
            "duration_minutes": 20,
        }, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data["questions"]), 10)
        session = PracticeSession.objects.get(id=response.data["session_id"])
        self.assertEqual(session.topic_id, topic.id)

    def test_session_resolves_university_topic_from_explicit_question_set(self):
        subject, _ = Subject.objects.get_or_create(
            slug="ana-201",
            defaults={"name": "Gross Anatomy", "code": "ANA 201", "track": Subject.Track.UNIVERSITY},
        )
        topic = Topic.objects.create(subject=subject, name="Lower Limb", slug="ul-bones")
        Question.objects.bulk_create([
            Question(
                external_id=f"test-university-topic-inference-{index}", topic=topic,
                text=f"University topic inference question {index}",
                options=["Option A", "Option B", "Option C", "Option D"], correct_index=0,
            )
            for index in range(2)
        ])
        response = self.client.post("/api/sessions/", {
            "subject": "ana-201",
            "topic": "catalog-topic-id-that-differs",
            "topic_name": "Catalog label that differs",
            "limit": 2,
            "mode": "normal",
            "question_ids": [f"test-university-topic-inference-{index}" for index in range(2)],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        session = PracticeSession.objects.get(id=response.data["session_id"])
        self.assertEqual(session.topic_id, topic.id)

    def test_session_rejects_missing_or_empty_topic_without_creating_session(self):
        subject = Subject.objects.get(slug="physics")
        empty_topic = Topic.objects.create(subject=subject, name="No questions yet", slug="no-questions-yet")
        before = PracticeSession.objects.filter(user=self.user).count()

        missing = self.client.post("/api/sessions/", {
            "subject": "physics",
            "topic": "not-in-database",
            "topic_name": "Not in database",
            "limit": 10,
            "duration_minutes": 20,
        }, format="json")
        self.assertEqual(missing.status_code, 400)
        self.assertIn("topic", missing.data)

        empty = self.client.post("/api/sessions/", {
            "subject": "physics",
            "topic": empty_topic.slug,
            "topic_name": empty_topic.name,
            "limit": 10,
            "duration_minutes": 20,
        }, format="json")
        self.assertEqual(empty.status_code, 400)
        self.assertIn("No active questions", empty.data["detail"])
        self.assertEqual(PracticeSession.objects.filter(user=self.user).count(), before)

    def test_university_mixed_session_can_only_use_the_free_topic_without_access(self):
        subject, _ = Subject.objects.get_or_create(
            slug="ana-201",
            defaults={
                "name": "Gross Anatomy", "code": "ANA 201",
                "track": Subject.Track.UNIVERSITY,
            },
        )
        free_topic = Topic.objects.create(subject=subject, name="Upper Limb Bones", slug="ul-bones")
        paid_topic = Topic.objects.create(subject=subject, name="Upper Limb Muscles", slug="ul-muscles")
        free_question = Question.objects.create(
            external_id="test-ana201-free", topic=free_topic, text="Free sample?",
            options=["A", "B", "C", "D"], correct_index=0,
        )
        paid_question = Question.objects.create(
            external_id="test-ana201-paid", topic=paid_topic, text="Paid sample?",
            options=["A", "B", "C", "D"], correct_index=0,
        )
        payload = {"subject": "ana-201", "limit": 1, "mode": "normal"}
        allowed = self.client.post("/api/sessions/", {
            **payload, "question_ids": [free_question.external_id],
        }, format="json")
        self.assertEqual(allowed.status_code, 201, allowed.data)
        denied = self.client.post("/api/sessions/", {
            **payload, "question_ids": [paid_question.external_id],
        }, format="json")
        self.assertEqual(denied.status_code, 403)

    def test_all_subject_session_is_balanced_and_grouped(self):
        response = self.client.post("/api/sessions/", {"subject": "all", "limit": 20, "duration_minutes": 10}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual([section["count"] for section in response.data["sections"]], [5, 5, 5, 5])
        self.assertEqual([question["subject"] for question in response.data["questions"]], ["english"] * 5 + ["mathematics"] * 5 + ["general-paper"] * 5 + ["physics"] * 5)
        session = self.user.practice_sessions.first()
        self.assertIsNone(session.subject)
        self.assertEqual(session.duration_minutes, 10)

    def test_saved_questions_can_form_a_review_session(self):
        saved_questions = list(Question.objects.filter(topic__subject__slug="english")[:3])
        for question in saved_questions:
            Bookmark.objects.create(user=self.user, question=question)
        response = self.client.post("/api/sessions/", {"subject": "saved", "limit": 3, "duration_minutes": 8}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["questions"]), 3)
        self.assertEqual({item["external_id"] for item in response.data["questions"]}, {item.external_id for item in saved_questions})

    def test_bookmark_is_visible_and_removable_across_devices(self):
        question = Question.objects.first()
        response = self.client.post("/api/bookmarks/", {"question_id": question.external_id}, format="json")
        self.assertEqual(response.status_code, 201)
        second_device = APIClient()
        second_device.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.assertEqual(second_device.get("/api/bookmarks/").data[0]["question_id"], question.external_id)
        second_device.delete("/api/bookmarks/", {"question_id": question.external_id}, format="json")
        self.assertEqual(self.client.get("/api/bookmarks/").data, [])

    def test_progress_submitted_on_one_device_is_visible_on_another(self):
        _, session, question = self._new_started_session()
        self._submit_answer(session, question)
        second_device = APIClient()
        second_device.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        response = second_device.get("/api/attempts/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["attempts"]), 1)
        self.assertEqual(response.data["stats"]["xp"], 5)
        self.assertEqual(response.data["stats"]["current_streak"], 1)

    def test_daily_sprint_is_limited_per_account_and_creates_a_session(self):
        response = self.client.post("/api/daily-sprint/", {}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["questions"]), 5)
        self.assertEqual(response.data["maximum_xp"], 25)
        self.assertEqual(self.user.practice_sessions.first().mode, "daily")
        self.assertEqual(self.client.post("/api/daily-sprint/", {}, format="json").status_code, 409)

    def test_question_comments_and_reports_use_public_api_values(self):
        question = Question.objects.first()
        comment = self.client.post(f"/api/questions/{question.external_id}/comments/", {"text": "This explanation helped."}, format="json")
        self.assertEqual(comment.status_code, 201)
        self.assertIn("created_at", comment.data)
        report = self.client.post(f"/api/questions/{question.external_id}/report/", {"reason": "wrong_key", "details": "Please review option B."}, format="json")
        self.assertEqual(report.status_code, 201)
        self.assertEqual(report.data["reason"], "wrong_key")
        duplicate = self.client.post(f"/api/questions/{question.external_id}/report/", {"reason": "wrong_key"}, format="json")
        self.assertEqual(duplicate.status_code, 409)

    def test_completed_session_awards_first_step_badge(self):
        _, session, question = self._new_started_session()
        answer = self._submit_answer(session, question)
        self.assertEqual(answer.status_code, 201)
        response = self.client.post(f"/api/sessions/{session.id}/complete/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("First Step", [item["name"] for item in response.data["badges_earned"]])
        achievements = self.client.get("/api/achievements/")
        first_step = next(item for item in achievements.data["badges"] if item["code"] == "first-step")
        self.assertTrue(first_step["earned"])
        self.assertTrue(UserBadge.objects.filter(user=self.user, badge__code="first-step").exists())

    def test_badge_progress_covers_every_catalog_entry(self):
        progress = badge_progress(self.user)
        catalog_codes = {item["code"] for item in BADGE_CATALOG}
        achievements = self.client.get("/api/achievements/")
        self.assertEqual(achievements.status_code, 200)
        self.assertEqual({item["code"] for item in achievements.data["badges"]}, catalog_codes)
        self.assertTrue(catalog_codes.issubset(progress))

    def test_bookmark_shelf_badge_tracks_saved_questions(self):
        questions = list(Question.objects.filter(topic__subject__slug="english")[:3])
        Bookmark.objects.bulk_create([Bookmark(user=self.user, question=question) for question in questions])
        self.assertEqual(badge_progress(self.user)["bookmark-shelf"], 3)

    def test_empty_started_session_is_closed_without_counting_as_a_test(self):
        _, session, _ = self._new_started_session()
        response = self.client.post(f"/api/sessions/{session.id}/complete/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], PracticeSession.Status.ABANDONED)
        analytics = self.client.get("/api/progress/").data["tests"]
        self.assertEqual(analytics["tests_taken"], 0)
        self.assertEqual(analytics["in_progress"], 0)

    def test_progress_reports_completed_tests_as_primary_analysis(self):
        questions = list(Question.objects.all()[:20])
        for offset, correct_count in ((0, 8), (10, 5)):
            selected = questions[offset:offset + 10]
            session = PracticeSession.objects.create(
                user=self.user, status=PracticeSession.Status.COMPLETED,
                began_at=timezone.now(), completed_at=timezone.now(), total_questions=10,
                question_ids=[item.external_id for item in selected],
            )
            for index, question in enumerate(selected):
                is_correct = index < correct_count
                Attempt.objects.create(
                    user=self.user, question=question, session=session, client_id=uuid.uuid4(),
                    selected_index=question.correct_index if is_correct else (question.correct_index + 1) % len(question.options),
                    is_correct=is_correct, xp_earned=5 if is_correct else 0,
                )
        response = self.client.get("/api/progress/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["tests"]["tests_taken"], 2)
        self.assertEqual(response.data["tests"]["average_score"], 65)
        self.assertEqual(response.data["tests"]["best_score"], 80)
        self.assertEqual(len(response.data["tests"]["recent_tests"]), 2)
        self.assertEqual(response.data["stats"]["tests"]["tests_taken"], 2)

    def test_five_completed_tests_award_test_milestone_badge(self):
        for _ in range(5):
            _, session, question = self._new_started_session()
            self.assertEqual(self._submit_answer(session, question).status_code, 201)
            self.assertEqual(self.client.post(f"/api/sessions/{session.id}/complete/", {}, format="json").status_code, 200)
        response = self.client.get("/api/achievements/")
        badge = next(item for item in response.data["badges"] if item["code"] == "five-papers")
        self.assertTrue(badge["earned"])
        self.assertEqual(badge["current"], 5)

    def test_unverified_completed_sessions_do_not_inflate_test_analytics_or_badges(self):
        PracticeSession.objects.create(
            user=self.user, status=PracticeSession.Status.COMPLETED,
            completed_at=timezone.now(), total_questions=10, question_ids=[],
        )
        response = self.client.get("/api/progress/")
        self.assertEqual(response.data["tests"]["tests_taken"], 0)
        self.assertEqual(response.data["tests"]["tests_today"], 0)
        achievements = self.client.get("/api/achievements/")
        first_step = next(item for item in achievements.data["badges"] if item["code"] == "first-step")
        self.assertFalse(first_step["earned"])

    def test_friend_challenge_freezes_paper_and_hides_group_scores_until_everyone_finishes(self):
        friend = get_user_model().objects.create_user(email="friend@example.com", username="studyfriend", password="Securepass934!")
        friend_token = Token.objects.create(user=friend)
        starts_at = timezone.now() + timedelta(minutes=5)
        ends_at = starts_at + timedelta(hours=2)
        create = self.client.post("/api/challenges/", {
            "title": "Saturday English Circle", "subject": "english", "question_count": 10,
            "duration_minutes": 15, "starts_at": starts_at.isoformat(), "ends_at": ends_at.isoformat(),
            "participant_ids": [friend.public_id],
        }, format="json")
        self.assertEqual(create.status_code, 201)
        challenge = Challenge.objects.get(id=create.data["id"])
        self.assertEqual(len(challenge.question_payload), 10)
        self.assertIn("correct", challenge.question_payload[0])

        friend_client = APIClient()
        friend_client.credentials(HTTP_AUTHORIZATION=f"Token {friend_token.key}")
        accepted = friend_client.post(f"/api/challenges/{challenge.id}/respond/", {"response": "accept"}, format="json")
        self.assertEqual(accepted.status_code, 200)
        challenge.starts_at = timezone.now() - timedelta(minutes=1)
        challenge.save(update_fields=("starts_at",))
        started = friend_client.post(f"/api/challenges/{challenge.id}/start/", {}, format="json")
        self.assertEqual(started.status_code, 201)
        self.assertNotIn("correct", started.data["questions"][0])
        self.assertNotIn("explanation", started.data["questions"][0])
        snapshot = challenge.question_payload[0]
        answer = friend_client.post("/api/attempts/", {
            "question_id": snapshot["external_id"], "selected_index": snapshot["correct"],
            "client_id": str(uuid.uuid4()), "session_id": started.data["session_id"],
        }, format="json")
        self.assertTrue(answer.data["accepted"])
        self.assertNotIn("correct", answer.data)
        self.assertNotIn("correct_index", answer.data)
        self.assertTrue(Attempt.objects.get(session_id=started.data["session_id"]).is_correct)
        resumed = friend_client.post(f"/api/challenges/{challenge.id}/start/", {}, format="json")
        self.assertEqual(resumed.data["answers"][snapshot["external_id"]], snapshot["correct"])
        duplicate_answer = friend_client.post("/api/attempts/", {
            "question_id": snapshot["external_id"], "selected_index": snapshot["correct"],
            "client_id": str(uuid.uuid4()), "session_id": started.data["session_id"],
        }, format="json")
        self.assertEqual(duplicate_answer.status_code, 409)
        completed = friend_client.post(f"/api/sessions/{started.data['session_id']}/complete/", {}, format="json")
        self.assertEqual(completed.status_code, 200)
        detail = friend_client.get(f"/api/challenges/{challenge.id}/")
        self.assertFalse(detail.data["results_unlocked"])
        self.assertEqual(detail.data["results"], [])
        self.assertEqual(detail.data["my_result"]["correct"], 1)
        creator_started = self.client.post(f"/api/challenges/{challenge.id}/start/", {}, format="json")
        creator_question = challenge.question_payload[0]
        creator_answer = self.client.post("/api/attempts/", {
            "question_id": creator_question["external_id"],
            "selected_index": creator_question["correct"],
            "client_id": str(uuid.uuid4()),
            "session_id": creator_started.data["session_id"],
        }, format="json")
        self.assertTrue(creator_answer.data["accepted"])
        self.client.post(f"/api/sessions/{creator_started.data['session_id']}/complete/", {}, format="json")
        unlocked = friend_client.get(f"/api/challenges/{challenge.id}/")
        self.assertTrue(unlocked.data["results_unlocked"])
        self.assertEqual(len(unlocked.data["results"]), 2)
        self.assertEqual(unlocked.data["my_result"]["bonus_xp"], 15)
        self.assertEqual(UserStats.objects.get(user=friend).xp, 20)

    def test_challenge_invitation_can_be_declined(self):
        friend = get_user_model().objects.create_user(email="decline@example.com", username="decliner", password="Securepass934!")
        token = Token.objects.create(user=friend)
        starts_at = timezone.now() + timedelta(minutes=10)
        response = self.client.post("/api/challenges/", {
            "title": "Quick Group Paper", "subject": "all", "question_count": 12,
            "duration_minutes": 10, "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=3)).isoformat(), "participant_ids": [friend.public_id],
        }, format="json")
        other = APIClient(); other.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        declined = other.post(f"/api/challenges/{response.data['id']}/respond/", {"response": "decline"}, format="json")
        self.assertEqual(declined.status_code, 200)
        self.assertEqual(declined.data["my_status"], ChallengeParticipant.Status.DECLINED)

        removed = other.delete(f"/api/challenges/{response.data['id']}/")
        self.assertEqual(removed.status_code, 204)
        participation = ChallengeParticipant.objects.get(challenge_id=response.data["id"], user=friend)
        self.assertIsNotNone(participation.hidden_at)
        self.assertEqual(other.get("/api/challenges/").data, [])
        self.assertEqual(other.get(f"/api/challenges/{response.data['id']}/").status_code, 404)

    def test_started_challenge_can_be_abandoned_without_erasing_answers(self):
        friend = get_user_model().objects.create_user(email="leave@example.com", username="leaver", password="Securepass934!")
        token = Token.objects.create(user=friend)
        starts_at = timezone.now() + timedelta(minutes=5)
        created = self.client.post("/api/challenges/", {
            "title": "Leave safely", "subject": "english", "question_count": 10,
            "duration_minutes": 15, "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=2)).isoformat(), "participant_ids": [friend.public_id],
        }, format="json")
        challenge = Challenge.objects.get(id=created.data["id"])
        other = APIClient(); other.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        other.post(f"/api/challenges/{challenge.id}/respond/", {"response": "accept"}, format="json")
        challenge.starts_at = timezone.now() - timedelta(minutes=1)
        challenge.save(update_fields=("starts_at",))
        started = other.post(f"/api/challenges/{challenge.id}/start/", {}, format="json")
        snapshot = challenge.question_payload[0]
        answer = other.post("/api/attempts/", {
            "question_id": snapshot["external_id"], "selected_index": snapshot["correct"],
            "client_id": str(uuid.uuid4()), "session_id": started.data["session_id"],
        }, format="json")
        self.assertEqual(answer.status_code, 201)

        removed = other.delete(f"/api/challenges/{challenge.id}/")
        self.assertEqual(removed.status_code, 204)
        participant = ChallengeParticipant.objects.get(challenge=challenge, user=friend)
        participant.practice_session.refresh_from_db()
        self.assertEqual(participant.status, ChallengeParticipant.Status.ABANDONED)
        self.assertIsNotNone(participant.hidden_at)
        self.assertEqual(participant.practice_session.status, PracticeSession.Status.ABANDONED)
        self.assertEqual(Attempt.objects.filter(session=participant.practice_session).count(), 1)

    def test_creator_leaving_unstarted_challenge_cancels_it_for_invitees(self):
        friend = get_user_model().objects.create_user(email="cancelled@example.com", username="cancelled", password="Securepass934!")
        token = Token.objects.create(user=friend)
        starts_at = timezone.now() + timedelta(minutes=15)
        created = self.client.post("/api/challenges/", {
            "title": "Cancelled circle", "subject": "all", "question_count": 10,
            "duration_minutes": 10, "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=2)).isoformat(), "participant_ids": [friend.public_id],
        }, format="json")
        challenge_id = created.data["id"]
        self.assertEqual(self.client.delete(f"/api/challenges/{challenge_id}/").status_code, 204)
        challenge = Challenge.objects.get(id=challenge_id)
        self.assertIsNotNone(challenge.cancelled_at)

        other = APIClient(); other.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        detail = other.get(f"/api/challenges/{challenge_id}/")
        self.assertEqual(detail.data["state"], "cancelled")
        self.assertFalse(detail.data["can_respond"])
        self.assertFalse(detail.data["can_start"])
        self.assertEqual(other.post(f"/api/challenges/{challenge_id}/respond/", {"response": "accept"}, format="json").status_code, 409)

    def test_challenge_accept_and_start_continue_when_activity_logging_fails(self):
        friend = get_user_model().objects.create_user(email="resilient@example.com", username="resilient", password="Securepass934!")
        friend_token = Token.objects.create(user=friend)
        starts_at = timezone.now() + timedelta(minutes=5)
        create = self.client.post("/api/challenges/", {
            "title": "Resilient Study Circle", "subject": "english", "question_count": 10,
            "duration_minutes": 15, "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=2)).isoformat(), "participant_ids": [friend.public_id],
        }, format="json")
        self.assertEqual(create.status_code, 201)
        challenge = Challenge.objects.get(id=create.data["id"])
        friend_client = APIClient()
        friend_client.credentials(HTTP_AUTHORIZATION=f"Token {friend_token.key}")

        with patch.object(ActivityEvent.objects, "create", side_effect=DatabaseError("monitoring unavailable")):
            accepted = friend_client.post(f"/api/challenges/{challenge.id}/respond/", {"response": "accept"}, format="json")
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.data["my_status"], ChallengeParticipant.Status.ACCEPTED)

        challenge.starts_at = timezone.now() - timedelta(minutes=1)
        challenge.save(update_fields=("starts_at",))
        with patch.object(ActivityEvent.objects, "create", side_effect=DatabaseError("monitoring unavailable")):
            started = friend_client.post(f"/api/challenges/{challenge.id}/start/", {}, format="json")
        self.assertEqual(started.status_code, 201)
        self.assertTrue(started.data["session_id"])
        self.assertEqual(ChallengeParticipant.objects.get(challenge=challenge, user=friend).status, ChallengeParticipant.Status.STARTED)

class MonitorPermissionTests(TestCase):
    def test_student_cannot_access_monitor(self):
        user = get_user_model().objects.create_user(email="student2@example.com", username="student2", password="Securepass934!")
        self.client.force_login(user)
        response = self.client.get("/monitor/")
        self.assertEqual(response.status_code, 302)

    def test_staff_can_access_monitor(self):
        staff = get_user_model().objects.create_user(email="staff@example.com", username="staff", password="Securepass934!", is_staff=True)
        self.client.force_login(staff)
        response = self.client.get("/monitor/")
        self.assertEqual(response.status_code, 200)

    def test_staff_reset_generates_one_time_password_and_revokes_tokens(self):
        staff = get_user_model().objects.create_user(email="staff-reset@example.com", username="staff-reset", password="Securepass934!", is_staff=True)
        student = get_user_model().objects.create_user(email="forgot@example.com", username="forgot", password="OldSecure934!")
        Token.objects.create(user=student)
        self.client.force_login(staff)
        response = self.client.post(f"/monitor/students/{student.public_id}/reset-password/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("no-store", response["Cache-Control"])
        generated = response.context["temporary_password"]
        student.refresh_from_db()
        self.assertTrue(student.must_change_password)
        self.assertTrue(student.check_password(generated))
        self.assertFalse(Token.objects.filter(user=student).exists())

    def test_student_cannot_reset_another_students_password(self):
        student = get_user_model().objects.create_user(email="no-reset@example.com", username="no-reset", password="Securepass934!")
        target = get_user_model().objects.create_user(email="target@example.com", username="target", password="Securepass934!")
        self.client.force_login(student)
        response = self.client.post(f"/monitor/students/{target.public_id}/reset-password/")
        self.assertEqual(response.status_code, 302)
