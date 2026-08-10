import uuid

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import Attempt, Question, UserStats

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
