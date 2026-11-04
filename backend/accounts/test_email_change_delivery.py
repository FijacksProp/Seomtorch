from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase, override_settings
from .email_changes import send_change_code
from .models import EmailChangeRequest


@override_settings(BREVO_SENDER_NAME="Seomtorch", BREVO_SENDER_EMAIL="sender@example.com")
class NewInboxOnlyDeliveryTests(SimpleTestCase):
    def test_only_new_inbox_receives_a_verification_code(self):
        change = SimpleNamespace(old_email="mistake@example.com", new_email="correct@example.com")
        with patch("accounts.email_changes._send_payload") as send:
            send_change_code(change, "123456")
        send.assert_called_once()
        message = send.call_args.args[0]
        self.assertEqual(message["to"], [{"email": "correct@example.com"}])
        self.assertIn("123456", message["textContent"])
        self.assertNotIn("mistake@example.com", message["textContent"])
        self.assertIn("No code is needed from your previous inbox", message["textContent"])

    def test_new_requests_cost_one_and_old_workers_keep_conservative_quota(self):
        field = EmailChangeRequest._meta.get_field("code_email_count")
        self.assertEqual(field.default, 1)
        self.assertEqual(field.db_default, 2)
        self.assertEqual(EmailChangeRequest._meta.get_field("old_code_hash").default, "")
