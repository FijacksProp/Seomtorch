from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

class AuthenticationTests(APITestCase):
    def test_register_returns_token_and_six_character_id(self):
        response = self.client.post("/api/auth/register/", {"email": "ada@example.com", "username": "ada", "password": "Securepass934!"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["user"]["public_id"]), 6)
        self.assertTrue(response.data["token"])
        self.assertEqual(get_user_model().objects.get().email, "ada@example.com")

    def test_sign_in_uses_email_not_username(self):
        get_user_model().objects.create_user(email="student@example.com", username="different-name", password="Securepass934!")
        response = self.client.post("/api/auth/login/", {"email": "student@example.com", "password": "Securepass934!"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["username"], "different-name")

    def test_duplicate_email_is_rejected_case_insensitively(self):
        get_user_model().objects.create_user(email="student@example.com", username="first", password="Securepass934!")
        response = self.client.post("/api/auth/register/", {"email": "STUDENT@example.com", "username": "second", "password": "Securepass934!"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_signing_out_one_device_keeps_shared_account_token_valid(self):
        user = get_user_model().objects.create_user(email="multi@example.com", username="multi", password="Securepass934!")
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, 204)
        self.assertTrue(Token.objects.filter(key=token.key).exists())
