import hashlib
import hmac
import json
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .access_policy import limited_access_end
from .models import CourseAccess, DiscountCode, PartnerAdminMembership, PartnerOrganization, PartnerStudentMembership, PaymentTransaction, PlanConfig
from learning.models import Attempt, PracticeSession, Question, Subject, Topic
from learning.access import accessible_university_question_ids

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
        self.course = Subject.objects.create(slug="ana-201-test", name="Anatomy", code="ANA 201", track=Subject.Track.UNIVERSITY, is_active=True)

    def test_registration_window_and_configurable_default_prices_are_published(self):
        response = self.client.get("/api/subscriptions/config/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["semester_price"], 3000)
        self.assertEqual(response.data["all_access_price"], 3000)
        self.assertEqual(response.data["single_course_price"], 1500)
        self.assertEqual(response.data["limited_access_days"], 14)
        access = response.data["user_access"]
        self.assertTrue(access["limited_access_active"])
        self.assertTrue(access["preview_active"])
        self.assertEqual(access["access_percentage"], 20)
        self.assertEqual(access["limited_access_expires_at"], limited_access_end(self.user).isoformat())
        self.assertNotIn("launch_offer", response.data)

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

    def test_trial_route_is_retired_and_single_course_checkout_is_available(self):
        trial = self.client.post("/api/subscriptions/start-trial/")
        self.assertEqual(trial.status_code, status.HTTP_404_NOT_FOUND)
        single = self.client.post("/api/subscriptions/initialize/", {
            "access_type": "single_course", "course_code": "ANA 201",
        }, format="json")
        self.assertEqual(single.status_code, status.HTTP_201_CREATED)
        self.assertEqual(single.data["amount"], 1500)
        self.assertFalse(CourseAccess.objects.filter(user=self.user).exists())

    def test_all_course_payment_uses_configured_price_and_unlocks_every_course(self):
        init = self.client.post("/api/subscriptions/initialize/", {"access_type": "all_access"}, format="json")
        self.assertEqual(init.status_code, status.HTTP_201_CREATED, init.data)
        self.assertEqual(init.data["amount"], 3000)
        verified = self.client.post("/api/subscriptions/verify/", {"reference": init.data["reference"]}, format="json")
        self.assertEqual(verified.status_code, status.HTTP_200_OK, verified.data)
        self.assertTrue(verified.data["user_access"]["has_all_access"])
        for course_code in ("ANA 201", "ANA 203", "PIO 201"):
            self.assertTrue(CourseAccess.user_has_course_access(self.user, course_code))

    def test_unknown_discount_codes_are_rejected(self):
        validate = self.client.post("/api/subscriptions/validate-code/", {"code": "OLD", "access_type": "all_access"}, format="json")
        self.assertEqual(validate.status_code, status.HTTP_404_NOT_FOUND)
        init = self.client.post("/api/subscriptions/initialize/", {
            "access_type": "all_access", "discount_code": "OLD",
        }, format="json")
        self.assertEqual(init.status_code, status.HTTP_404_NOT_FOUND)
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

    def test_legacy_trial_grants_do_not_unlock_but_single_course_grants_are_scoped(self):
        for access_type, granted_by in (("trial", "trial"),):
            CourseAccess.objects.create(
                user=self.user, access_type=access_type, granted_by=granted_by,
                course_code="ANA 201", expires_at=timezone.now() + timedelta(days=30),
            )
        self.assertFalse(CourseAccess.user_has_course_access(self.user, "ANA 201"))
        self.assertFalse(CourseAccess.get_user_access_summary(self.user)["has_all_access"])
        CourseAccess.objects.create(
            user=self.user, access_type="single_course", granted_by="payment",
            course_code="ANA 201", expires_at=timezone.now() + timedelta(days=30),
        )
        self.assertTrue(CourseAccess.user_has_course_access(self.user, "ANA 201"))
        self.assertFalse(CourseAccess.user_has_course_access(self.user, "ANA 203"))
        self.assertEqual(CourseAccess.get_user_access_summary(self.user)["access_status"], "partial")

    def test_server_question_entitlement_returns_full_bank_only_for_purchased_course(self):
        anatomy_topic = Topic.objects.create(subject=self.course, slug="bones", name="Bones")
        for index in range(5):
            Question.objects.create(
                external_id=f"ana-bank-{index}", topic=anatomy_topic, text=f"Anatomy question {index}",
                options=["A", "B", "C", "D"], correct_index=0,
            )
        physiology = Subject.objects.create(slug="pio-201-bank-test", name="Physiology", code="PIO 201", track=Subject.Track.UNIVERSITY)
        physiology_topic = Topic.objects.create(subject=physiology, slug="membrane", name="Membrane")
        physiology_ids = []
        for index in range(5):
            question = Question.objects.create(
                external_id=f"pio-bank-{index}", topic=physiology_topic, text=f"Physiology question {index}",
                options=["A", "B", "C", "D"], correct_index=0,
            )
            physiology_ids.append(question.external_id)
        CourseAccess.objects.create(
            user=self.user, access_type=CourseAccess.AccessType.SINGLE_COURSE,
            granted_by=CourseAccess.GrantedBy.PAYMENT, course_code=self.course.code,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.assertIsNone(accessible_university_question_ids(self.user, self.course))
        physiology_sample = accessible_university_question_ids(self.user, physiology)
        self.assertIsNotNone(physiology_sample)
        self.assertLess(len(physiology_sample), len(physiology_ids))
        self.assertTrue(physiology_sample.issubset(set(physiology_ids)))

    @override_settings(PAYSTACK_SECRET_KEY="webhook-test-secret")
    def test_webhook_accepts_verified_single_course_amount_and_rejects_bad_signature(self):
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
        tampered_signature = self.client.post(
            "/api/subscriptions/paystack-webhook/", body, content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE="0" * 128,
        )
        self.assertEqual(tampered_signature.status_code, status.HTTP_400_BAD_REQUEST)
        accepted = self.client.post(
            "/api/subscriptions/paystack-webhook/", body, content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=signature,
        )
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
        grant = CourseAccess.objects.get(reference=tx.reference)
        self.assertEqual(grant.access_type, CourseAccess.AccessType.SINGLE_COURSE)
        self.assertEqual(grant.course_code, "ANA 201")

    def test_discount_validation_is_plan_scoped_and_never_free(self):
        code = DiscountCode.objects.create(
            code="CAMPUS", label="Campus group", target_plan=DiscountCode.PlanType.SINGLE_COURSE,
            discounted_price=1000,
        )
        valid = self.client.post("/api/subscriptions/validate-code/", {
            "code": code.code, "access_type": "single_course", "course_code": self.course.code,
        }, format="json")
        self.assertEqual(valid.status_code, status.HTTP_200_OK)
        self.assertEqual(valid.data["amount"], 1000)
        wrong_plan = self.client.post("/api/subscriptions/validate-code/", {
            "code": code.code, "access_type": "all_access",
        }, format="json")
        self.assertEqual(wrong_plan.status_code, status.HTTP_400_BAD_REQUEST)

        code.discounted_price = 0
        code.save(update_fields=("discounted_price",))
        free = self.client.post("/api/subscriptions/validate-code/", {
            "code": code.code, "access_type": "single_course", "course_code": self.course.code,
        }, format="json")
        self.assertEqual(free.status_code, status.HTTP_400_BAD_REQUEST)
        code.discounted_price = 1000
        code.times_used = 1
        code.max_uses = 1
        code.save(update_fields=("discounted_price", "times_used", "max_uses"))
        exhausted = self.client.post("/api/subscriptions/validate-code/", {
            "code": code.code, "access_type": "single_course", "course_code": self.course.code,
        }, format="json")
        self.assertEqual(exhausted.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(TESTING=True)
    def test_confirmed_partner_code_attributes_once_and_pending_amount_stays_fixed(self):
        organization = PartnerOrganization.objects.create(name="North Institute", slug="north-institute")
        code = DiscountCode.objects.create(
            code="NORTH", label="North cohort", target_plan=DiscountCode.PlanType.ALL_ACCESS,
            discounted_price=2500, partner_organization=organization,
        )
        initialized = self.client.post("/api/subscriptions/initialize/", {
            "access_type": "all_access", "discount_code": code.code,
        }, format="json")
        self.assertEqual(initialized.status_code, status.HTTP_201_CREATED, initialized.data)
        self.assertEqual(initialized.data["amount"], 2500)
        self.assertFalse(PartnerStudentMembership.objects.filter(user=self.user).exists())
        self.config.all_access_price = 5000
        self.config.save(update_fields=("all_access_price",))
        transaction = PaymentTransaction.objects.get(reference=initialized.data["reference"])
        self.assertEqual(transaction.amount, 2500)

        verified = self.client.post("/api/subscriptions/verify/", {"reference": transaction.reference}, format="json")
        self.assertEqual(verified.status_code, status.HTTP_200_OK, verified.data)
        code.refresh_from_db()
        self.assertEqual(code.times_used, 1)
        membership = PartnerStudentMembership.objects.get(user=self.user)
        self.assertEqual(membership.organization, organization)
        repeated = self.client.post("/api/subscriptions/verify/", {"reference": transaction.reference}, format="json")
        self.assertEqual(repeated.status_code, status.HTTP_200_OK)
        code.refresh_from_db()
        self.assertEqual(code.times_used, 1)

    def test_student_cannot_redeem_another_institute_code_when_already_affiliated(self):
        one = PartnerOrganization.objects.create(name="West College", slug="west-college")
        two = PartnerOrganization.objects.create(name="East College", slug="east-college")
        PartnerStudentMembership.objects.create(user=self.user, organization=one)
        code = DiscountCode.objects.create(
            code="EAST", label="East cohort", target_plan=DiscountCode.PlanType.ALL_ACCESS,
            discounted_price=2500, partner_organization=two,
        )
        validate = self.client.post("/api/subscriptions/validate-code/", {
            "code": code.code, "access_type": "all_access",
        }, format="json")
        self.assertEqual(validate.status_code, status.HTTP_409_CONFLICT)


class PartnerPortalTests(APITestCase):
    def setUp(self):
        self.org_one = PartnerOrganization.objects.create(name="One Institute", slug="one-institute")
        self.org_two = PartnerOrganization.objects.create(name="Two Institute", slug="two-institute")
        self.partner_admin = User.objects.create_user(
            email="partner@example.com", username="partner", password="StrongPass2026!",
            user_type="university", active_mode="university",
        )
        self.other_student = User.objects.create_user(
            email="student@example.com", username="private-student", password="StrongPass2026!",
            user_type="university", active_mode="university",
        )
        subject = Subject.objects.create(slug="partner-pio-201", name="Physiology", code="PIO 201", track=Subject.Track.UNIVERSITY)
        topic = Topic.objects.create(subject=subject, slug="partner-topic", name="Cell physiology")
        questions = [Question.objects.create(
            external_id=f"partner-{index}-{self.other_student.public_id}", topic=topic,
            text=f"Partner dashboard question {index}", options=["A", "B", "C", "D"], correct_index=0,
        ) for index in range(2)]
        session = PracticeSession.objects.create(
            user=self.other_student, subject=subject, topic=topic, track="university", course_code=subject.code,
            topic_title=topic.name, question_ids=[question.external_id for question in questions],
            status=PracticeSession.Status.COMPLETED, began_at=timezone.now() - timedelta(minutes=10),
            completed_at=timezone.now(), total_questions=2,
        )
        Attempt.objects.bulk_create([
            Attempt(user=self.other_student, question=question, session=session, client_id=uuid.uuid4(), selected_index=0 if index == 0 else 1, is_correct=index == 0)
            for index, question in enumerate(questions)
        ])
        PartnerAdminMembership.objects.create(organization=self.org_one, user=self.partner_admin)
        PartnerStudentMembership.objects.create(user=self.other_student, organization=self.org_two)

    def test_partner_user_cannot_select_an_unrelated_institute(self):
        from django.test import Client

        client = Client()
        client.force_login(self.partner_admin)
        response = client.get("/partner/?org=two-institute")
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "private-student")
        self.assertContains(response, "One Institute")
        monitor_response = client.get("/monitor/")
        self.assertEqual(monitor_response.status_code, 302)

    def test_general_staff_can_open_any_partner_cohort(self):
        from django.test import Client

        staff = User.objects.create_superuser(email="staff@example.com", username="staff", password="StrongPass2026!")
        client = Client()
        client.force_login(staff)
        response = client.get("/partner/?org=two-institute")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Two Institute")
        self.assertContains(response, self.other_student.public_id)
        self.assertContains(response, "PIO 201")
        self.assertContains(response, "50%")
        self.assertNotContains(response, self.other_student.email)
