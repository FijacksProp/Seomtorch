from datetime import timedelta
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    PlanConfig,
    DiscountCode,
    CourseAccess,
    PaymentTransaction,
)

User = get_user_model()


class MonetizationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="medstudent@example.com",
            username="medstudent",
            password="StrongPass2026!"
        )
        self.client.force_authenticate(user=self.user)
        self.config = PlanConfig.get_solo()

    def test_plan_config_defaults_and_launch_offer(self):
        self.assertEqual(self.config.single_course_price, 1500)
        self.assertEqual(self.config.all_access_price, 3000)
        self.assertEqual(self.config.launch_offer_price, 2000)
        self.assertTrue(self.config.is_launch_offer_valid)
        self.assertEqual(self.config.current_all_access_price, 2000)

        # Deactivate launch offer
        self.config.launch_offer_active = False
        self.config.save()
        self.assertFalse(self.config.is_launch_offer_valid)
        self.assertEqual(self.config.current_all_access_price, 3000)

    def test_start_3_day_free_trial(self):
        response = self.client.post("/api/subscriptions/start-trial/")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["user_access"]["is_trial"])
        self.assertTrue(response.data["user_access"]["has_all_access"])
        self.assertGreaterEqual(response.data["user_access"]["trial_days_remaining"], 2)

        # Trying to start trial a second time must be rejected
        response2 = self.client.post("/api/subscriptions/start-trial/")
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already redeemed", response2.data["detail"])

    def test_initialize_and_verify_all_access_payment(self):
        # Initialize
        init_resp = self.client.post("/api/subscriptions/initialize/", {
            "access_type": "all_access",
        }, format="json")
        self.assertEqual(init_resp.status_code, status.HTTP_201_CREATED)
        reference = init_resp.data["reference"]
        self.assertEqual(init_resp.data["amount"], 2000) # Launch offer

        # Verify
        verify_resp = self.client.post("/api/subscriptions/verify/", {
            "reference": reference,
        }, format="json")
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(verify_resp.data["user_access"]["has_all_access"])
        self.assertIn("ANA 201", verify_resp.data["user_access"]["unlocked_courses"])

        # Check model query
        self.assertTrue(CourseAccess.user_has_course_access(self.user, "ANA 201"))
        self.assertTrue(CourseAccess.user_has_course_access(self.user, "ANA 203"))
        self.assertTrue(CourseAccess.user_has_course_access(self.user, "PIO 201"))

    def test_class_discount_code(self):
        discount = DiscountCode.objects.create(
            code="UNILAG25",
            label="UNILAG 200L Anatomy",
            discounted_price=2500,
            target_plan=DiscountCode.PlanType.ALL_ACCESS,
            is_active=True,
            max_uses=50,
        )

        # Validate code endpoint
        val_resp = self.client.post("/api/subscriptions/validate-code/", {
            "code": "unilag25",
            "plan": "all_access",
        }, format="json")
        self.assertEqual(val_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(val_resp.data["valid"])
        self.assertEqual(val_resp.data["discounted_price"], 2500)

        # Initialize with code
        init_resp = self.client.post("/api/subscriptions/initialize/", {
            "access_type": "all_access",
            "discount_code": "UNILAG25",
        }, format="json")
        self.assertEqual(init_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(init_resp.data["amount"], 2500)
        reference = init_resp.data["reference"]

        # Verify
        verify_resp = self.client.post("/api/subscriptions/verify/", {
            "reference": reference,
        }, format="json")
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)

        discount.refresh_from_db()
        self.assertEqual(discount.times_used, 1)

    def test_single_course_purchase(self):
        init_resp = self.client.post("/api/subscriptions/initialize/", {
            "access_type": "single_course",
            "course_code": "ANA 201",
        }, format="json")
        self.assertEqual(init_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(init_resp.data["amount"], 1500)
        reference = init_resp.data["reference"]

        verify_resp = self.client.post("/api/subscriptions/verify/", {
            "reference": reference,
        }, format="json")
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)

        self.assertTrue(CourseAccess.user_has_course_access(self.user, "ANA 201"))
        self.assertFalse(CourseAccess.user_has_course_access(self.user, "ANA 203"))
        self.assertFalse(CourseAccess.user_has_course_access(self.user, "PIO 201"))
