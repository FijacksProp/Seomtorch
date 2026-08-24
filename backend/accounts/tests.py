from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase
from unittest.mock import patch

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

    def test_initial_superuser_password_can_only_reset_with_explicit_flag(self):
        user = get_user_model().objects.create_superuser(email="admin@example.com", username="admin", password="OldSecure934!")
        environment = {
            "DJANGO_SUPERUSER_EMAIL": "admin@example.com",
            "DJANGO_SUPERUSER_USERNAME": "admin",
            "DJANGO_SUPERUSER_PASSWORD": "NewSecure934!",
            "DJANGO_SUPERUSER_RESET_PASSWORD": "True",
        }
        with patch.dict("os.environ", environment, clear=False):
            call_command("create_initial_superuser", verbosity=0)
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewSecure934!"))

    def test_student_can_replace_a_temporary_password(self):
        user = get_user_model().objects.create_user(email="reset@example.com", username="reset", password="Temporary934!", must_change_password=True)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post("/api/auth/change-password/", {"current_password": "Temporary934!", "new_password": "Permanent934!Safe"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["user"]["must_change_password"])
        user.refresh_from_db()
        self.assertFalse(user.must_change_password)
        self.assertTrue(user.check_password("Permanent934!Safe"))

    def test_password_change_rejects_the_wrong_current_password(self):
        user = get_user_model().objects.create_user(email="secure@example.com", username="secure", password="Current934!Safe")
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post("/api/auth/change-password/", {"current_password": "Wrong934!", "new_password": "Replacement934!Safe"}, format="json")
        self.assertEqual(response.status_code, 400)
        user.refresh_from_db()
        self.assertTrue(user.check_password("Current934!Safe"))

    def test_temporary_password_account_cannot_use_learning_api_before_change(self):
        user = get_user_model().objects.create_user(email="blocked@example.com", username="blocked", password="Temporary934!", must_change_password=True)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get("/api/subjects/")
        self.assertEqual(response.status_code, 403)
        self.assertIn("temporary password", response.data["detail"])
