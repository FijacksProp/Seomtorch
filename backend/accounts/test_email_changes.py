from datetime import timedelta
from unittest.mock import patch
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from knox.models import AuthToken
from rest_framework.test import APITestCase
from learning.models import UserStats
from .models import User, EmailChangeRequest, EmailSignInChallenge
from .email_security import browser_digest, DeliveryUnavailable


@override_settings(ACCOUNT_SECURITY_ENABLED=True, ACCOUNT_SECURITY_GRACE_UNTIL="2099-01-01T00:00:00Z", BREVO_API_KEY="test-only", BREVO_SENDER_EMAIL="sender@example.com", PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class EmailChangeTests(APITestCase):
    key = "a" * 64
    url = "/api/auth/email/change/"

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="old@example.com", username="ada", password="Securepass934!")
        self.user.email_verified_at = timezone.now()
        self.user.trusted_browser_hash = browser_digest(self.key)
        self.user.save(update_fields=("email_verified_at", "trusted_browser_hash"))
        UserStats.objects.filter(user=self.user).update(xp=50)
        _, self.token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token}")
        self.sender = patch("accounts.email_changes.send_change_codes").start()
        self.addCleanup(patch.stopall)

    def request(self, **overrides):
        return self.client.post(self.url + "request/", {"new_email": "new@example.com", "current_password": "Securepass934!", "browser_key": self.key, **overrides}, format="json")

    def issue(self):
        result = self.request()
        self.assertEqual(result.status_code, 202, result.data)
        return result.data, self.sender.call_args.args[1:]

    def confirm(self, data, codes, **overrides):
        return self.client.post(self.url + "confirm/", {"request_id": data["request_id"], "old_code": codes[0], "new_code": codes[1], "confirm_change": True, "browser_key": self.key, **overrides}, format="json")

    def age(self):
        EmailChangeRequest.objects.filter(user=self.user).update(created_at=timezone.now() - timedelta(minutes=2))

    def test_both_codes_required_before_email_changes_and_progress_is_preserved(self):
        public_id = self.user.public_id
        data, codes = self.issue()
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "old@example.com")
        self.assertEqual(self.confirm(data, codes, new_code="wrong").status_code, 400)
        self.assertEqual(self.client.get("/api/auth/security/").status_code, 200)
        with patch("accounts.email_changes._notify_previous_inbox") as notice, self.captureOnCommitCallbacks(execute=True):
            result = self.confirm(data, codes)
        self.assertEqual(result.status_code, 200, result.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new@example.com")
        self.assertTrue(self.user.email_verified_at)
        self.assertEqual(self.user.public_id, public_id)
        self.assertEqual(UserStats.objects.get(user=self.user).xp, 50)
        self.assertEqual(AuthToken.objects.filter(user=self.user).count(), 1)
        self.assertEqual(self.client.get("/api/auth/security/").status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {result.data['token']}")
        self.assertEqual(self.confirm(data, codes).status_code, 400)
        self.assertTrue(EmailChangeRequest.objects.get().accepted_at)
        notice.assert_called_once_with("old@example.com", "new@example.com")

    def test_password_and_address_validation_prevent_sending(self):
        User.objects.create_user(email="taken@example.com", username="other", password="Securepass934!")
        for values in [{"current_password": "wrong"}, {"new_email": "bad"}, {"new_email": "OLD@example.com"}, {"new_email": "TAKEN@example.com"}]:
            self.assertEqual(self.request(**values).status_code, 400)
        self.sender.assert_not_called()
        self.assertFalse(EmailChangeRequest.objects.exists())

    def test_new_email_is_normalized(self):
        result = self.request(new_email=" NEW@EXAMPLE.COM ")
        self.assertEqual(result.status_code, 202)
        self.assertEqual(EmailChangeRequest.objects.get().new_email, "new@example.com")

    def test_codes_are_hashed_and_cannot_be_swapped_or_used_on_other_browser(self):
        data, codes = self.issue()
        row = EmailChangeRequest.objects.get()
        self.assertNotEqual(row.old_code_hash, codes[0])
        self.assertNotEqual(row.new_code_hash, codes[1])
        self.assertNotEqual(codes[0], codes[1])
        self.assertEqual(self.confirm(data, tuple(reversed(codes))).status_code, 400)
        self.assertEqual(self.confirm(data, codes, browser_key="b" * 64).status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "old@example.com")

    def test_five_attempts_and_expiry_are_enforced(self):
        data, codes = self.issue()
        for _ in range(5):
            self.assertEqual(self.confirm(data, codes, new_code="bad").status_code, 400)
        self.assertEqual(self.confirm(data, codes).status_code, 400)
        self.age()
        data, codes = self.issue()
        EmailChangeRequest.objects.filter(pk=data["request_id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.confirm(data, codes).status_code, 400)

    def test_resend_has_persistent_cooldown_and_replaces_both_codes(self):
        data, codes = self.issue()
        payload = {"request_id": data["request_id"], "browser_key": self.key}
        cache.clear()
        self.assertEqual(self.client.post(self.url + "resend/", payload).status_code, 429)
        self.age()
        result = self.client.post(self.url + "resend/", payload)
        self.assertEqual(result.status_code, 202, result.data)
        self.assertEqual(self.confirm(data, codes).status_code, 400)
        self.assertEqual(self.confirm(result.data, self.sender.call_args.args[1:]).status_code, 200)

    def test_code_email_budget_is_shared_with_login(self):
        self.issue(); self.age(); self.issue(); self.age()
        self.assertEqual(self.request().status_code, 429)  # four code emails + two would exceed five/hour
        with patch("accounts.email_security.send_code"):
            result = self.client.post("/api/auth/login/", {"email": self.user.email, "password": "Securepass934!", "browser_key": "b" * 64})
        self.assertEqual(result.status_code, 202)
        self.assertEqual(EmailSignInChallenge.objects.count(), 1)
        EmailSignInChallenge.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        self.assertEqual(self.request().status_code, 429)
        self.assertEqual(EmailChangeRequest.objects.count(), 2)

    def test_cancellation_and_explicit_consent(self):
        data, codes = self.issue()
        self.assertEqual(self.confirm(data, codes, confirm_change=False).status_code, 400)
        self.assertEqual(self.client.post(self.url + "cancel/", {"request_id": data["request_id"], "browser_key": self.key}).status_code, 204)
        self.assertEqual(self.confirm(data, codes).status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "old@example.com")

    def test_delivery_failure_leaves_old_address_and_session_working(self):
        self.sender.side_effect = DeliveryUnavailable()
        self.assertEqual(self.request().status_code, 503)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "old@example.com")
        self.assertTrue(EmailChangeRequest.objects.get().consumed_at)
        self.assertEqual(self.client.get("/api/auth/security/").status_code, 200)
        cache.clear()
        self.assertEqual(self.request().status_code, 429)

    def test_changed_password_and_taken_address_cannot_be_confirmed(self):
        data, codes = self.issue()
        User.objects.create_user(email="new@example.com", username="other", password="Securepass934!")
        self.assertEqual(self.confirm(data, codes).status_code, 400)
        self.user.set_password("Changedpass934!")
        self.user.save(update_fields=("password",))
        self.assertEqual(self.confirm(data, codes).status_code, 400)

    def test_other_accounts_and_unsigned_requests_cannot_use_change_requests(self):
        data, codes = self.issue()
        other = User.objects.create_user(email="other@example.com", username="other", password="Securepass934!")
        _, token = AuthToken.objects.create(other)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(self.confirm(data, codes).status_code, 400)
        self.client.credentials()
        self.assertEqual(self.request().status_code, 401)

    def test_unverified_existing_students_can_use_flow_after_grace_but_need_old_inbox(self):
        self.user.email_verified_at = None
        self.user.save(update_fields=("email_verified_at",))
        with override_settings(ACCOUNT_SECURITY_GRACE_UNTIL="2000-01-01T00:00:00Z"):
            self.assertEqual(self.client.get("/api/community/network/").status_code, 403)
            data, codes = self.issue()
            self.assertEqual(self.confirm(data, codes).status_code, 200)

    def test_security_notice_failure_cannot_undo_confirmed_change(self):
        data, codes = self.issue()
        with patch("accounts.email_changes._send_payload", side_effect=DeliveryUnavailable()), self.captureOnCommitCallbacks(execute=True):
            response = self.confirm(data, codes)
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new@example.com")

    def test_database_conflict_rolls_back_email_verification_and_token_revocation(self):
        from django.db import IntegrityError
        data, codes = self.issue()
        with patch("accounts.email_changes.issue_token", side_effect=IntegrityError("simulated conflict")):
            result = self.confirm(data, codes)
        self.assertEqual(result.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "old@example.com")
        self.assertTrue(self.user.email_verified_at)
        self.assertEqual(self.client.get("/api/auth/security/").status_code, 200)
        self.assertIsNone(EmailChangeRequest.objects.get().accepted_at)
