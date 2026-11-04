from django.test import TestCase, override_settings, Client
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient
from knox.models import AuthToken
from .models import User, AccountSecurityPolicy, AccountSecurityPolicyChange
from .email_security import effective_grace_deadline, security_status


@override_settings(ACCOUNT_SECURITY_ENABLED=True, ACCOUNT_SECURITY_GRACE_UNTIL="2099-01-01T00:00:00+00:00", PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class SecurityMonitorTests(TestCase):
    path = "/monitor/account-security/"

    def setUp(self):
        self.admin = User.objects.create_user(email="admin@example.com", username="admin", password="Secure934!", is_staff=True)
        self.student = User.objects.create_user(email="student@example.com", username="student", password="Secure934!")
        self.client.force_login(self.admin)
        self.data = {"grace_until": "2099-02-01T23:59:59", "reason": "Extend the verification window", "expected_version": "0"}

    def save(self, **extra):
        return self.client.post(self.path, {**self.data, "action": "save", "confirm": "on", **extra})

    def test_get_is_read_only_and_shows_existing_environment_deadline(self):
        response = self.client.get(self.path)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Lagos time")
        self.assertContains(response, "2099-01-01T01:00:00")
        self.assertFalse(AccountSecurityPolicy.objects.exists())
        self.assertFalse(AccountSecurityPolicyChange.objects.exists())

    def test_review_does_not_mutate_and_save_requires_confirmation(self):
        response = self.client.post(self.path, {**self.data, "action": "review"})
        self.assertContains(response, "Confirm the new deadline")
        self.assertFalse(AccountSecurityPolicy.objects.exists())
        self.assertEqual(self.save(confirm="").status_code, 400)
        self.assertFalse(AccountSecurityPolicy.objects.exists())

    def test_confirmed_save_is_lagos_time_audited_and_overrides_environment(self):
        self.assertEqual(self.save().status_code, 302)
        policy = AccountSecurityPolicy.objects.get(pk=1)
        self.assertEqual(policy.grace_until, parse_datetime("2099-02-01T22:59:59Z"))
        self.assertEqual(policy.updated_by, self.admin)
        self.assertEqual(policy.version, 1)
        change = AccountSecurityPolicyChange.objects.get()
        self.assertEqual(change.changed_by, self.admin)
        self.assertEqual(change.previous_deadline, parse_datetime("2099-01-01T00:00:00Z"))
        with override_settings(ACCOUNT_SECURITY_GRACE_UNTIL="2000-01-01T00:00:00Z"):
            self.assertEqual(effective_grace_deadline(), policy.grace_until)
            self.assertFalse(security_status(self.student)["verification_required"])

    def test_past_deadline_enforces_existing_unverified_sessions_and_extension_reopens_grace(self):
        _, token = AuthToken.objects.create(self.student)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(self.save(grace_until="2000-01-01T00:00:00").status_code, 302)
        self.assertEqual(api.get("/api/community/network/").status_code, 403)
        self.assertEqual(api.get("/api/auth/security/").status_code, 200)
        self.assertEqual(self.save(expected_version="1").status_code, 302)
        self.assertEqual(api.get("/api/community/network/").status_code, 200)

    def test_verified_accounts_remain_protected_without_extra_policy_read(self):
        self.save(grace_until="2000-01-01T00:00:00")
        self.student.email_verified_at = timezone.now()
        with self.assertNumQueries(0):
            state = security_status(self.student)
        self.assertFalse(state["verification_required"])
        self.assertTrue(state["single_signin"])

    def test_stale_admin_form_cannot_overwrite_someone_elses_change(self):
        self.save()
        response = self.save(grace_until="2099-03-01T00:00:00")
        self.assertEqual(response.status_code, 409)
        self.assertContains(response, "Another administrator changed", status_code=409)
        self.assertEqual(AccountSecurityPolicy.objects.get().version, 1)
        self.assertEqual(AccountSecurityPolicyChange.objects.count(), 1)

    def test_invalid_or_unconfirmed_posts_cannot_clear_deadline(self):
        for data in [{"grace_until": ""}, {"grace_until": "invalid"}, {"reason": ""}, {"expected_version": "-1"}]:
            self.assertEqual(self.save(**data).status_code, 400)
        self.assertFalse(AccountSecurityPolicy.objects.exists())

    def test_students_and_guests_cannot_read_or_change_settings(self):
        for user in [None, self.student]:
            self.client.logout()
            if user:
                self.client.force_login(user)
            self.assertEqual(self.client.get(self.path).status_code, 302)
            self.assertEqual(self.save().status_code, 302)
        self.assertFalse(AccountSecurityPolicy.objects.exists())

    def test_csrf_is_enforced_and_master_switch_stays_in_render(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.admin)
        self.assertEqual(client.post(self.path, {**self.data, "action": "save", "confirm": "on"}).status_code, 403)
        with override_settings(ACCOUNT_SECURITY_ENABLED=False):
            self.save(grace_until="2000-01-01T00:00:00")
            self.assertFalse(security_status(self.student)["verification_required"])

    def test_history_escapes_admin_reason(self):
        self.save(reason='<script>alert("bad")</script>')
        response = self.client.get(self.path)
        self.assertContains(response, "&lt;script&gt;")
        self.assertNotContains(response, '<script>alert("bad")</script>')
