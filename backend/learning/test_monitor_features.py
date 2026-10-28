from datetime import timedelta
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from monetization.models import CourseAccess, DiscountCode, PlanConfig
from learning.models import Subject, Topic, Question, PracticeSession

User = get_user_model()


class MonitorProFeatureTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            email="admin@example.com",
            username="admin",
            password="AdminPassword123!",
            is_staff=True,
            is_superuser=True
        )
        self.student = User.objects.create_user(
            email="student1@example.com",
            username="student1",
            password="StudentPassword123!",
            is_staff=False
        )
        self.client.force_login(self.staff)

        # Base subject & topic
        self.subject = Subject.objects.create(name="Biology", slug="biology", position=1)
        self.topic = Topic.objects.create(subject=self.subject, name="Cell Biology", slug="cell-bio")

    def test_dashboard_with_ranges(self):
        # Test range query params
        for r in ["today", "7d", "30d", "all"]:
            response = self.client.get(f"/monitor/?range={r}")
            self.assertEqual(response.status_code, 200)
            self.assertIn("chart_activity_labels", response.context)
            self.assertIn("chart_mode_labels", response.context)
            self.assertIn("chart_subject_labels", response.context)
            self.assertIn("chart_tier_labels", response.context)

    def test_student_detail_with_charts_and_access(self):
        response = self.client.get(f"/monitor/students/{self.student.public_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("chart_subject_labels", response.context)
        self.assertIn("chart_test_labels", response.context)
        self.assertIn("chart_pie_labels", response.context)

    def test_grant_and_revoke_student_access(self):
        # Grant all-access
        grant_res = self.client.post(
            f"/monitor/students/{self.student.public_id}/grant-access/",
            {"access_type": "all_access", "course_code": "all", "expires_at": "2027-04-01"}
        )
        self.assertEqual(grant_res.status_code, 302)
        grant = CourseAccess.objects.filter(user=self.student, is_active=True).first()
        self.assertIsNotNone(grant)
        self.assertEqual(grant.access_type, "all_access")

        # Revoke access
        revoke_res = self.client.post(
            f"/monitor/students/{self.student.public_id}/revoke-access/",
            {"access_id": grant.id}
        )
        self.assertEqual(revoke_res.status_code, 302)
        grant.refresh_from_db()
        self.assertFalse(grant.is_active)

    def test_monetization_hub_and_update_pricing(self):
        response = self.client.get("/monitor/monetization/")
        self.assertEqual(response.status_code, 200)

        # Update pricing
        post_res = self.client.post("/monitor/monetization/update-pricing/", {
            "single_course_price": "1800",
            "all_access_price": "3500",
            "launch_offer_price": "2200",
            "launch_offer_active": "on",
            "launch_offer_max_buyers": "150",
            "trial_duration_days": "4",
            "semester_end_date": "2027-05-30",
            "paystack_public_key": "pk_test_sample",
            "paystack_secret_key": "sk_test_sample",
        })
        self.assertEqual(post_res.status_code, 302)

        config = PlanConfig.get_solo()
        self.assertEqual(config.single_course_price, 1800)
        self.assertEqual(config.all_access_price, 3500)
        self.assertEqual(config.launch_offer_price, 2200)
        self.assertTrue(config.launch_offer_active)
        self.assertEqual(config.trial_duration_days, 4)

    def test_create_and_toggle_discount_code(self):
        create_res = self.client.post("/monitor/monetization/create-discount/", {
            "code": "TESTMED25",
            "label": "Medical Class 2025",
            "discounted_price": "2400",
            "target_plan": "all_access",
            "max_uses": "50",
        })
        self.assertEqual(create_res.status_code, 302)

        code_obj = DiscountCode.objects.filter(code="TESTMED25").first()
        self.assertIsNotNone(code_obj)
        self.assertTrue(code_obj.is_active)
        self.assertEqual(code_obj.discounted_price, 2400)

        # Toggle inactive
        toggle_res = self.client.post(f"/monitor/monetization/toggle-discount/{code_obj.id}/")
        self.assertEqual(toggle_res.status_code, 302)
        code_obj.refresh_from_db()
        self.assertFalse(code_obj.is_active)

    def test_questions_list_and_add_question(self):
        # View list
        list_res = self.client.get("/monitor/questions/")
        self.assertEqual(list_res.status_code, 200)

        # Add question
        add_res = self.client.post("/monitor/questions/add/", {
            "subject_id": str(self.subject.id),
            "topic_id": str(self.topic.id),
            "text": "What is the powerhouse of the cell?",
            "option_a": "Mitochondria",
            "option_b": "Ribosome",
            "option_c": "Endoplasmic Reticulum",
            "option_d": "Golgi Apparatus",
            "correct_option": "0",
            "explanation": "Mitochondria generate most of the chemical energy needed to power the cell's biochemical reactions.",
            "difficulty": "standard",
            "source": "JAMB Prep",
        })
        self.assertEqual(add_res.status_code, 302)

        q = Question.objects.filter(text="What is the powerhouse of the cell?").first()
        self.assertIsNotNone(q)
        self.assertEqual(q.correct_index, 0)
        self.assertEqual(q.options[0], "Mitochondria")
        self.assertEqual(q.explanation_status, Question.ExplanationStatus.REVIEWED)
