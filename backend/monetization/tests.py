import hashlib
import hmac
import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .access_policy import limited_access_end
from .models import CourseAccess, PaymentTransaction, PlanConfig

User = get_user_model()


class MonetizationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="medstudent@example.com", username="medstudent",
            password="StrongPass2026!", user_type="university", active_mode="university",
        )
        self.client.force_authenticate(user=self.user)
        self.config = PlanConfig.get_solo()
        self.config.semester_end_date = timezone.now() + timedelta(days=150)
        self.config.save(update_fields=("semester_end_date",))

    def test_registration_window_is_fourteen_days_and_price_is_fixed(self):
        response = self.client.get("/api/subscriptions/config/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["semester_price"], 2500)
        self.assertEqual(response.data["limited_access_days"], 14)
        access = response.data["user_access"]
        self.assertTrue(access["limited_access_active"])
        self.assertTrue(access["preview_active"])
        self.assertEqual(access["access_percentage"], 20)
        self.assertEqual(access["limited_access_expires_at"], limited_access_end(self.user).isoformat())
        self.assertNotIn("launch_offer", response.data)
        self.assertNotIn("single_course_price", response.data)

    def test_monitor_managed_duration_recalculates_from_registration(self):
        self.config.limited_access_days = 21
        self.config.save(update_fields=("limited_access_days",))
        self.user.refresh_from_db()
        expected = self.user.created_at + timedelta(days=21)
        self.assertEqual(limited_access_end(self.user), expected)

    def test_aspirants_do_not_receive_the_university_limited_access_window(self):
        aspirant = User.objects.create_user(
            email="aspirant@example.com", username="aspirant",
            password="StrongPass2026!", user_type="aspirant", active_mode="aspirant",
        )
        self.assertFalse(CourseAccess.get_user_access_summary(aspirant)["limited_access_active"])

    def test_trial_route_and_single_course_checkout_are_retired(self):
        trial = self.client.post("/api/subscriptions/start-trial/")
        self.assertEqual(trial.status_code, status.HTTP_404_NOT_FOUND)
        single = self.client.post("/api/subscriptions/initialize/", {
            "access_type": "single_course", "course_code": "ANA 201",
        }, format="json")
        self.assertEqual(single.status_code, status.HTTP_410_GONE)
        self.assertFalse(CourseAccess.objects.filter(user=self.user).exists())

    def test_fixed_semester_payment_unlocks_all_university_courses(self):
        init = self.client.post("/api/subscriptions/initialize/", {"access_type": "all_access"}, format="json")
        self.assertEqual(init.status_code, status.HTTP_201_CREATED, init.data)
        self.assertEqual(init.data["amount"], 2500)
        verified = self.client.post("/api/subscriptions/verify/", {"reference": init.data["reference"]}, format="json")
        self.assertEqual(verified.status_code, status.HTTP_200_OK, verified.data)
        self.assertTrue(verified.data["user_access"]["has_all_access"])
        for course_code in ("ANA 201", "ANA 203", "PIO 201"):
            self.assertTrue(CourseAccess.user_has_course_access(self.user, course_code))

    def test_discount_codes_are_retired_and_cannot_change_the_fixed_amount(self):
        validate = self.client.post("/api/subscriptions/validate-code/", {"code": "OLD"}, format="json")
        self.assertEqual(validate.status_code, status.HTTP_404_NOT_FOUND)
        init = self.client.post("/api/subscriptions/initialize/", {
            "access_type": "all_access", "discount_code": "OLD",
        }, format="json")
        self.assertEqual(init.status_code, status.HTTP_410_GONE)
        self.assertFalse(PaymentTransaction.objects.exists())

    def test_expired_preview_keeps_five_percent_sample_access_and_account(self):
        self.user.created_at = timezone.now() - timedelta(days=15)
        self.user.save(update_fields=("created_at",))
        access = self.client.get("/api/subscriptions/my-access/")
        self.assertEqual(access.status_code, status.HTTP_200_OK)
        self.assertTrue(access.data["limited_access_active"])
        self.assertFalse(access.data["preview_active"])
        self.assertEqual(access.data["access_percentage"], 5)
        self.assertEqual(access.data["access_status"], "sample")
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_legacy_single_course_and_trial_grants_cannot_unlock(self):
        for access_type, granted_by in (("single_course", "payment"), ("trial", "trial")):
            CourseAccess.objects.create(
                user=self.user, access_type=access_type, granted_by=granted_by,
                course_code="ANA 201", expires_at=timezone.now() + timedelta(days=30),
            )
        self.assertFalse(CourseAccess.user_has_course_access(self.user, "ANA 201"))
        self.assertFalse(CourseAccess.get_user_access_summary(self.user)["has_all_access"])

    @override_settings(PAYSTACK_SECRET_KEY="webhook-test-secret")
    def test_webhook_requires_signature_and_rejects_nonfixed_or_single_course_payment(self):
        tx = PaymentTransaction.objects.create(
            reference="seom_webhook_security_test", user=self.user, amount=1500,
            access_type=PaymentTransaction.AccessType.SINGLE_COURSE, course_code="ANA 201",
        )
        event = {"event": "charge.success", "data": {
            "status": "success", "reference": tx.reference, "amount": 150000,
            "currency": "NGN", "customer": {"email": self.user.email},
        }}
        body = json.dumps(event, separators=(",", ":"))
        missing = self.client.post("/api/subscriptions/paystack-webhook/", body, content_type="application/json")
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        signature = hmac.new(b"webhook-test-secret", body.encode(), hashlib.sha512).hexdigest()
        invalid = self.client.post(
            "/api/subscriptions/paystack-webhook/", body, content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=signature,
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CourseAccess.objects.filter(reference=tx.reference).exists())
