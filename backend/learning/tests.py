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
