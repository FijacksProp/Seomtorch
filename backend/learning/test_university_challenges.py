import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from monetization.models import CourseAccess
from .models import Attempt, Challenge, ChallengeParticipant, PracticeSession, Question, Subject, Topic


@override_settings(ACCOUNT_SECURITY_ENABLED=False, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class UniversityChallengeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.host = get_user_model().objects.create_user(email="host@example.com", username="host", password="SecurePass934!")
        cls.friend = get_user_model().objects.create_user(email="friend@example.com", username="friend", password="SecurePass934!")
        cls.outsider = get_user_model().objects.create_user(email="outsider@example.com", username="outsider", password="SecurePass934!")
        cls.course = Subject.objects.create(slug="challenge-ana-201", name="Anatomy", code="ANA 201", track="university")
        cls.free = Topic.objects.create(subject=cls.course, slug="ul-bones", name="Bones of the Upper Limb")
        cls.paid = Topic.objects.create(subject=cls.course, slug="ul-joints", name="Joints of the Upper Limb")
        Question.objects.bulk_create([
            Question(external_id=f"uni-challenge-{topic.slug}-{i}", topic=topic, text=f"Anatomy question {i}", options=["A", "B", "C", "D"], correct_index=0, explanation="A is correct.")
            for topic in (cls.free, cls.paid) for i in range(12)
        ])

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.host)
        self.friend_client = APIClient()
        self.friend_client.force_authenticate(self.friend)

    def grant(self, user):
        return CourseAccess.objects.create(user=user, access_type="single_course", course_code="ANA 201", expires_at=timezone.now() + timedelta(days=30))

    def create(self, **extra):
        now = timezone.now()
        data = {"title": "Upper limb together", "track": "university", "subject": self.course.slug, "topic": self.free.slug,
                "question_count": 10, "duration_minutes": 10, "starts_at": now.isoformat(), "ends_at": (now + timedelta(hours=2)).isoformat(), "participant_ids": [self.friend.public_id]}
        return self.client.post("/api/challenges/", {**data, **extra}, format="json")

    def start(self, response, client=None):
        return (client or self.client).post(f"/api/challenges/{response.data['id']}/start/", {}, format="json")

    def test_free_topic_challenge_works_for_both_students_and_tracks_university(self):
        created = self.create()
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["track"], "university")
        self.assertEqual(created.data["course_code"], "ANA 201")
        accepted = self.friend_client.post(f"/api/challenges/{created.data['id']}/respond/", {"response": "accept"}, format="json")
        self.assertEqual(accepted.status_code, 200, accepted.data)
        started = self.start(created, self.friend_client)
        self.assertEqual(started.status_code, 201, started.data)
        session = PracticeSession.objects.get(pk=started.data["session_id"])
        self.assertEqual(session.track, "university")
        self.assertEqual(session.course_code, "ANA 201")
        self.assertEqual(session.topic, self.free)
        self.assertEqual(session.topic_title, self.free.name)
        for question in started.data["questions"]:
            self.assertEqual(question["topic_slug"], "ul-bones")
            self.assertNotIn("correct", question)
            self.assertNotIn("explanation", question)

    def test_paid_topic_requires_own_access_at_creation_acceptance_and_start(self):
        self.assertEqual(self.create(topic=self.paid.slug).status_code, 403)
        self.grant(self.host)
        created = self.create(topic=self.paid.slug)
        self.assertEqual(created.status_code, 201, created.data)
        url = f"/api/challenges/{created.data['id']}/respond/"
        self.assertEqual(self.friend_client.post(url, {"response": "accept"}, format="json").status_code, 403)
        grant = self.grant(self.friend)
        self.assertEqual(self.friend_client.post(url, {"response": "accept"}, format="json").status_code, 200)
        grant.is_active = False
        grant.save()
        self.assertEqual(self.start(created, self.friend_client).status_code, 403)
        self.assertFalse(PracticeSession.objects.filter(user=self.friend).exists())

    def test_locked_invitation_can_still_be_declined(self):
        self.grant(self.host)
        created = self.create(topic=self.paid.slug)
        result = self.friend_client.post(f"/api/challenges/{created.data['id']}/respond/", {"response": "decline"}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["my_status"], "declined")

    def test_mixed_course_is_grouped_and_cannot_be_created_without_course_access(self):
        self.assertEqual(self.create(topic="").status_code, 403)
        self.grant(self.host)
        created = self.create(topic="", question_count=24)
        self.assertEqual(created.status_code, 201, created.data)
        questions = self.start(created).data["questions"]
        self.assertEqual(len(questions), 24)
        self.assertEqual(len({q["topic_slug"] for q in questions[:12]}), 1)
        self.assertNotEqual(questions[0]["topic_slug"], questions[-1]["topic_slug"])

    def test_catalog_exposes_access_and_counts_but_not_answer_keys(self):
        result = self.client.get("/api/challenges/catalog/")
        self.assertEqual(result.status_code, 200)
        course = next(c for c in result.data if c["id"] == self.course.slug)
        topics = {t["id"]: t for t in course["topics"]}
        self.assertFalse(course["full_access"])
        self.assertTrue(topics[self.free.slug]["accessible"])
        self.assertFalse(topics[self.paid.slug]["accessible"])
        self.assertEqual(topics[self.free.slug]["question_count"], 12)
        self.assertNotIn("questions", course)
        self.grant(self.host)
        full = self.client.get("/api/challenges/catalog/")
        self.assertTrue(next(c for c in full.data if c["id"] == self.course.slug)["full_access"])

    def test_batch_grades_frozen_paper_without_revealing_answers_and_is_idempotent(self):
        created = self.create()
        started = self.start(created)
        challenge = Challenge.objects.get(pk=created.data["id"])
        Question.objects.filter(topic=self.free).update(correct_index=1)
        data = {"session_id": started.data["session_id"], "attempts": [
            {"question_id": q["external_id"], "selected_index": q["correct"] if i < 7 else 3, "client_id": str(uuid.uuid4())}
            for i, q in enumerate(challenge.question_payload)
        ]}
        for _ in range(2):
            result = self.client.post("/api/attempts/bulk/", data, format="json")
            self.assertEqual(result.status_code, 200, result.data)
            self.assertTrue(result.data["accepted"])
            self.assertNotIn("stats", result.data)
            for row in result.data["results"]:
                self.assertEqual(set(row), {"client_id", "question_id", "accepted"})
        attempts = Attempt.objects.filter(session_id=started.data["session_id"])
        self.assertEqual(attempts.count(), 10)
        self.assertEqual(attempts.filter(is_correct=True).count(), 7)
        self.assertEqual(sum(a.xp_earned for a in attempts), 35)
        for _ in range(2):
            completed = self.client.post(f"/api/sessions/{started.data['session_id']}/complete/", {}, format="json")
            self.assertEqual(completed.status_code, 200, completed.data)
            self.assertEqual(completed.data["correct"], 7)
            self.assertEqual(str(completed.data["challenge_id"]), created.data["id"])
        detail = self.client.get(f"/api/challenges/{created.data['id']}/")
        self.assertEqual(detail.data["my_result"]["correct"], 7)
        self.assertFalse(detail.data["results_unlocked"])
        self.assertEqual(detail.data["results"], [])

    def test_batch_rejects_expired_timer_and_unrelated_student(self):
        created = self.create()
        started = self.start(created)
        question_id = started.data["questions"][0]["external_id"]
        data = {"session_id": started.data["session_id"], "attempts": [{"question_id": question_id, "selected_index": 0, "client_id": str(uuid.uuid4())}]}
        other = APIClient()
        other.force_authenticate(self.outsider)
        self.assertEqual(other.post("/api/attempts/bulk/", data, format="json").status_code, 404)
        ChallengeParticipant.objects.filter(practice_session_id=started.data["session_id"]).update(deadline_at=timezone.now() - timedelta(seconds=91))
        self.assertEqual(self.client.post("/api/attempts/bulk/", data, format="json").status_code, 409)
        self.assertFalse(Attempt.objects.exists())

    def test_hundred_question_batch_has_bounded_database_work(self):
        Question.objects.bulk_create([
            Question(external_id=f"uni-extra-{i}", topic=self.free, text=f"Question {i}", options=["A", "B"], correct_index=0)
            for i in range(88)
        ])
        created = self.create(question_count=100)
        started = self.start(created)
        body = {"session_id": started.data["session_id"], "attempts": [
            {"question_id": q["external_id"], "selected_index": 0, "client_id": str(uuid.uuid4())} for q in started.data["questions"]
        ]}
        with CaptureQueriesContext(connection) as queries:
            result = self.client.post("/api/attempts/bulk/", body, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(len(result.data["results"]), 100)
        self.assertLess(len(queries), 30, "Batch work must not add a query for every answer.")

    def test_empty_paper_does_not_leave_participant_stuck_in_progress(self):
        created = self.create()
        started = self.start(created)
        for _ in range(2):
            result = self.client.post(f"/api/sessions/{started.data['session_id']}/complete/", {}, format="json")
            self.assertEqual(result.status_code, 200)
        self.assertEqual(ChallengeParticipant.objects.get(practice_session_id=started.data["session_id"]).status, "abandoned")
        self.assertFalse(PracticeSession.objects.filter(status="completed").exists())

    def test_university_paper_cannot_silently_fall_back_to_aspirant_subjects(self):
        self.assertEqual(self.create(subject="all").status_code, 400)
        self.assertEqual(self.create(track="aspirant").status_code, 404)
        self.assertEqual(self.create(track="invalid").status_code, 400)
