import uuid

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from .models import Attempt, Bookmark, Question, UserStats

class LearningApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("import_questions", verbosity=0)
        cls.user = get_user_model().objects.create_user(email="learner@example.com", username="learner", password="Securepass934!")
        cls.token = Token.objects.create(user=cls.user)

    def setUp(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def test_correct_answer_awards_five_xp(self):
        question = Question.objects.first()
        response = self.client.post("/api/attempts/", {"question_id": question.external_id, "selected_index": question.correct_index, "client_id": str(uuid.uuid4())}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["attempt"]["xp_earned"], 5)
        self.assertEqual(response.data["stats"]["xp"], 5)

    def test_incorrect_answer_awards_no_xp(self):
        question = Question.objects.first(); wrong = (question.correct_index + 1) % 4
        response = self.client.post("/api/attempts/", {"question_id": question.external_id, "selected_index": wrong, "client_id": str(uuid.uuid4())}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["attempt"]["xp_earned"], 0)
        self.assertEqual(response.data["stats"]["xp"], 0)

    def test_duplicate_client_attempt_is_idempotent(self):
        question = Question.objects.first(); client_id = str(uuid.uuid4())
        body = {"question_id": question.external_id, "selected_index": question.correct_index, "client_id": client_id}
        self.client.post("/api/attempts/", body, format="json"); response = self.client.post("/api/attempts/", body, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Attempt.objects.filter(user=self.user).count(), 1)
        self.assertEqual(UserStats.objects.get(user=self.user).xp, 5)

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

    def test_all_subject_session_is_balanced_and_grouped(self):
        response = self.client.post("/api/sessions/", {"subject": "all", "limit": 20, "duration_minutes": 10}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual([section["count"] for section in response.data["sections"]], [7, 7, 6])
        self.assertEqual([question["subject"] for question in response.data["questions"]], ["english"] * 7 + ["mathematics"] * 7 + ["general-paper"] * 6)
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
        question = Question.objects.first()
        self.client.post("/api/attempts/", {"question_id": question.external_id, "selected_index": question.correct_index, "client_id": str(uuid.uuid4())}, format="json")
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
