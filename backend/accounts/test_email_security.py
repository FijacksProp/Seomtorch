from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from knox.models import AuthToken
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase, APIClient

from .email_security import DeliveryUnavailable, browser_digest, send_code
from .models import User, EmailSignInChallenge


@override_settings(ACCOUNT_SECURITY_ENABLED=True, ACCOUNT_SECURITY_GRACE_UNTIL="2099-01-01T00:00:00+00:00", BREVO_API_KEY="test-only", BREVO_SENDER_EMAIL="sender@example.com", PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class EmailSecurityTests(APITestCase):
    key = "a" * 64
    other_key = "b" * 64

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="ada@example.com", username="ada", password="Securepass934!")
        self.sender = patch("accounts.email_security.send_code").start()
        self.addCleanup(patch.stopall)

    def login(self, key=None):
        return self.client.post("/api/auth/login/", {"email": self.user.email, "password": "Securepass934!", "browser_key": key or self.key}, format="json")

    def issue(self, key=None):
        response = self.login(key)
        self.assertEqual(response.status_code, 202, response.data)
        self.assertNotIn("token", response.data)
        return response.data, self.sender.call_args.args[1]

    def verify(self, challenge, code, key=None):
        return self.client.post("/api/auth/email/verify/", {"challenge_id": challenge["challenge_id"], "code": code, "browser_key": key or self.key}, format="json")

    def age_requests(self):
        EmailSignInChallenge.objects.filter(user=self.user).update(created_at=timezone.now() - timedelta(minutes=2))

    def enroll(self):
        challenge, code = self.issue()
        response = self.verify(challenge, code)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["token"]

    def test_approval_replaces_sessions_only_after_correct_code(self):
        _, old = AuthToken.objects.create(self.user)
        legacy = Token.objects.create(user=self.user)
        challenge, code = self.issue()
        self.assertTrue(AuthToken.objects.filter(user=self.user).exists())
        self.assertEqual(self.verify(challenge, "bad").status_code, 400)
        self.assertTrue(Token.objects.filter(pk=legacy.pk).exists())
        response = self.verify(challenge, code)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuthToken.objects.filter(user=self.user).count(), 1)
        self.assertFalse(Token.objects.filter(user=self.user).exists())
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {old}")
        self.assertEqual(self.client.get("/api/auth/security/").status_code, 401)
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified_at)
        self.assertEqual(self.user.trusted_browser_hash, browser_digest(self.key))

    def test_code_is_hashed_bound_single_use_and_has_five_attempt_limit(self):
        challenge, code = self.issue()
        row = EmailSignInChallenge.objects.get(pk=challenge["challenge_id"])
        self.assertNotEqual(row.code_hash, code)
        self.assertNotIn(self.key, row.browser_hash)
        self.assertEqual(self.verify(challenge, code, self.other_key).status_code, 400)
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(4):
            self.assertEqual(self.verify(challenge, wrong).status_code, 400)
        self.assertEqual(self.verify(challenge, code).status_code, 400)
        self.assertEqual(AuthToken.objects.filter(user=self.user).count(), 0)
        self.age_requests()
        challenge, code = self.issue()
        self.assertEqual(self.verify(challenge, code).status_code, 200)
        self.assertEqual(self.verify(challenge, code).status_code, 400)

    def test_expired_changed_password_or_changed_email_cannot_approve(self):
        challenge, code = self.issue()
        EmailSignInChallenge.objects.filter(pk=challenge["challenge_id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.verify(challenge, code).status_code, 400)
        self.age_requests()
        challenge, code = self.issue()
        self.user.set_password("Changedpassword934!")
        self.user.save(update_fields=("password",))
        self.assertEqual(self.verify(challenge, code).status_code, 400)
        self.user.email = "new@example.com"
        self.user.save(update_fields=("email",))
        self.assertEqual(self.verify(challenge, code).status_code, 400)

    def test_resend_cooldown_persists_and_invalidates_previous_code(self):
        challenge, code = self.issue()
        payload = {"challenge_id": challenge["challenge_id"], "browser_key": self.key}
        cache.clear()
        self.assertEqual(self.client.post("/api/auth/email/resend/", payload).status_code, 429)
        self.age_requests()
        result = self.client.post("/api/auth/email/resend/", payload)
        self.assertEqual(result.status_code, 202)
        self.assertEqual(self.verify(challenge, code).status_code, 400)
        self.assertEqual(self.verify(result.data, self.sender.call_args.args[1]).status_code, 200)

    def test_failed_delivery_does_not_revoke_owner_and_is_rate_limited(self):
        _, old = AuthToken.objects.create(self.user)
        self.sender.side_effect = DeliveryUnavailable()
        self.assertEqual(self.login().status_code, 503)
        self.assertTrue(AuthToken.objects.filter(user=self.user).exists())
        self.assertTrue(EmailSignInChallenge.objects.get(user=self.user).consumed_at)
        cache.clear()
        self.assertEqual(self.login().status_code, 429)

    def test_same_browser_login_rotates_token_without_email(self):
        old = self.enroll()
        calls = self.sender.call_count
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.sender.call_count, calls)
        self.assertEqual(AuthToken.objects.filter(user=self.user).count(), 1)
        self.assertNotEqual(response.data["token"], old)
        self.assertEqual(self.login(self.other_key).status_code, 429)  # first code was just sent
        self.age_requests()
        self.assertEqual(self.login(self.other_key).status_code, 202)

    def test_rolling_transfer_cap_and_support_recovery(self):
        self.enroll()
        for key in [self.other_key, "c" * 64]:
            self.age_requests()
            challenge, code = self.issue(key)
            self.assertEqual(self.verify(challenge, code, key).status_code, 200)
        self.age_requests()
        self.assertEqual(self.login("d" * 64).status_code, 400)
        self.assertEqual(AuthToken.objects.filter(user=self.user).count(), 1)
        call_command("recover_student_signin", self.user.public_id, reason="TEST-TICKET")
        self.assertEqual(AuthToken.objects.filter(user=self.user).count(), 0)
        self.assertEqual(self.login("d" * 64).status_code, 202)

    def test_existing_students_have_grace_and_verification_escape_route(self):
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(self.client.get("/api/community/network/").status_code, 200)
        with override_settings(ACCOUNT_SECURITY_GRACE_UNTIL="2020-01-01T00:00:00+00:00"):
            response = self.client.get("/api/community/network/")
            self.assertEqual(response.status_code, 403)
            self.assertEqual(str(response.data["code"]), "email_verification_required")
            self.assertEqual(self.client.get("/api/auth/security/").status_code, 200)
            self.assertEqual(self.client.post("/api/auth/email/request/", {"browser_key": self.key}).status_code, 202)

    def test_new_registration_requires_approval_and_invalid_key_does_not_create_user(self):
        payload = {"email": "new@example.com", "username": "new", "password": "Securepass934!", "browser_key": "bad"}
        self.assertEqual(self.client.post("/api/auth/register/", payload).status_code, 400)
        self.assertFalse(User.objects.filter(email=payload["email"]).exists())
        payload["browser_key"] = self.key
        response = self.client.post("/api/auth/register/", payload)
        self.assertEqual(response.status_code, 202, response.data)
        self.assertFalse(AuthToken.objects.filter(user__email=payload["email"]).exists())

    def test_disabled_rollout_and_staff_signins_are_unaffected(self):
        with override_settings(ACCOUNT_SECURITY_ENABLED=False):
            self.assertEqual(self.login().status_code, 200)
            self.assertEqual(self.login(self.other_key).status_code, 200)
            self.assertEqual(AuthToken.objects.filter(user=self.user).count(), 2)
        self.user.is_staff = True
        self.user.save(update_fields=("is_staff",))
        self.assertEqual(self.login().status_code, 200)

    def test_brevo_uses_https_and_never_returns_provider_errors(self):
        from urllib.error import HTTPError
        with patch("accounts.email_security.urlopen", side_effect=HTTPError("https://api.brevo.com", 429, "private provider text", {}, None)) as mocked:
            with self.assertRaises(DeliveryUnavailable) as caught:
                send_code(self.user.email, "123456")
            self.assertNotIn("private provider", str(caught.exception))
            request = mocked.call_args.args[0]
            self.assertEqual(request.full_url, "https://api.brevo.com/v3/smtp/email")

    def test_email_correction_revokes_sessions_and_requires_reverification(self):
        token = self.enroll()
        self.user.refresh_from_db()
        self.user.email = "corrected@example.com"
        self.user.save(update_fields=("email",))
        self.user.refresh_from_db()
        self.assertIsNone(self.user.email_verified_at)
        self.assertEqual(self.user.trusted_browser_hash, "")
        self.assertFalse(AuthToken.objects.filter(user=self.user).exists())
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(self.client.get("/api/auth/security/").status_code, 401)

    def test_resend_cannot_be_used_from_another_browser_or_after_approval(self):
        challenge, code = self.issue()
        payload = {"challenge_id": challenge["challenge_id"], "browser_key": self.other_key}
        self.assertEqual(self.client.post("/api/auth/email/resend/", payload).status_code, 400)
        self.assertEqual(self.verify(challenge, code).status_code, 200)
        payload["browser_key"] = self.key
        self.assertEqual(self.client.post("/api/auth/email/resend/", payload).status_code, 400)

    def test_delivery_command_does_not_create_login_codes(self):
        with patch("accounts.email_security.urlopen") as mocked:
            mocked.return_value.__enter__.return_value.status = 201
            call_command("test_brevo_email", "consenting@example.com")
            import json
            body = json.loads(mocked.call_args.args[0].data)
            self.assertIn("delivery test", body["subject"])
            self.assertNotIn("Your code is", body["textContent"])
            self.assertFalse(EmailSignInChallenge.objects.exists())
