import uuid
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from monetization.models import CourseAccess, DiscountCode, PlanConfig
from learning.models import Attempt, Subject, Topic, Question, PracticeSession

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
        self.subject, _ = Subject.objects.get_or_create(slug="biology", defaults={"name": "Biology", "position": 1})
        self.topic, _ = Topic.objects.get_or_create(subject=self.subject, slug="cell-bio", defaults={"name": "Cell Biology"})

    def _record_verified_session(self, user, total, correct, course_code=""):
        now = timezone.now()
        subject = self.subject
        topic = self.topic
        track = "aspirant"
        if course_code:
            slug = course_code.lower().replace(" ", "-")
            subject, _ = Subject.objects.get_or_create(
                slug=slug,
                defaults={"name": course_code, "code": course_code, "track": Subject.Track.UNIVERSITY},
            )
            topic, _ = Topic.objects.get_or_create(subject=subject, slug="monitor-review", defaults={"name": "Monitor Review"})
            track = "university"
        questions = [Question.objects.create(
            external_id=f"monitor-{uuid.uuid4()}", topic=topic,
            text=f"Monitor test question {index + 1}",
            options=["Correct", "Incorrect", "Option C", "Option D"],
            correct_index=0, explanation="Verified by a server-recorded answer.",
        ) for index in range(total)]
        session = PracticeSession.objects.create(
            user=user, subject=subject, track=track, course_code=course_code,
            question_ids=[question.external_id for question in questions],
            total_questions=total, correct_answers=correct,
            status=PracticeSession.Status.COMPLETED,
            began_at=now - timedelta(minutes=10), completed_at=now,
        )
        Attempt.objects.bulk_create([
            Attempt(
                user=user, question=question, session=session, client_id=uuid.uuid4(),
                selected_index=0 if index < correct else 1,
                is_correct=index < correct, xp_earned=5 if index < correct else 0,
            )
            for index, question in enumerate(questions)
        ])
        return session

    def test_dashboard_with_ranges(self):
        # Test range query params
        for r in ["today", "7d", "30d", "all"]:
            response = self.client.get(f"/monitor/?range={r}")
            self.assertEqual(response.status_code, 200)
            self.assertIn("chart_activity_labels", response.context)
            self.assertIn("chart_mode_labels", response.context)
            self.assertIn("chart_subject_labels", response.context)
            self.assertIn("chart_tier_labels", response.context)

    def test_dashboard_subject_metrics_keep_independent_counts(self):
        self._record_verified_session(self.student, total=4, correct=3)
        self._record_verified_session(self.student, total=2, correct=1)

        response = self.client.get("/monitor/?track=aspirant&range=all")
        self.assertEqual(response.status_code, 200)
        biology = next(item for item in response.context["aspirant_subjects"] if item.slug == "biology")
        self.assertEqual(biology.total_attempts, 6)
        self.assertEqual(biology.correct_attempts, 4)
        self.assertEqual(biology.student_count, 1)
        self.assertEqual(biology.test_count, 2)
        self.assertEqual(biology.question_count, 6)
        self.assertEqual(biology.reviewed_count, 6)
        self.assertEqual(biology.accuracy, 67)
        self.assertEqual(biology.explanation_coverage, 100)

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

    def test_toggle_screenshot_protection(self):
        config = PlanConfig.get_solo()
        config.screenshot_protection_enabled = True
        config.save()

        # 1. Toggle off via monitor endpoint
        res = self.client.post("/monitor/monetization/toggle-screenshot-protection/")
        self.assertEqual(res.status_code, 302)
        config.refresh_from_db()
        self.assertFalse(config.screenshot_protection_enabled)

        # 2. Check public API returns false
        api_res = self.client.get("/api/subscriptions/config/")
        self.assertEqual(api_res.status_code, 200)
        self.assertFalse(api_res.json()["screenshot_protection_enabled"])

        # 3. Toggle back on
        res2 = self.client.post("/monitor/monetization/toggle-screenshot-protection/")
        self.assertEqual(res2.status_code, 302)
        config.refresh_from_db()
        self.assertTrue(config.screenshot_protection_enabled)

        # 4. Check public API returns true
        api_res2 = self.client.get("/api/subscriptions/config/")
        self.assertEqual(api_res2.status_code, 200)
        self.assertTrue(api_res2.json()["screenshot_protection_enabled"])

    def test_update_pricing_screenshot_toggle(self):
        config = PlanConfig.get_solo()
        config.screenshot_protection_enabled = True
        config.save()

        # Post update pricing with toggle explicitly unchecked
        res = self.client.post("/monitor/monetization/update-pricing/", {
            "single_course_price": "1500",
            "all_access_price": "3000",
            "launch_offer_price": "2000",
            "launch_offer_max_buyers": "100",
            "trial_duration_days": "3",
            "semester_end_date": "2027-05-30",
        })
        self.assertEqual(res.status_code, 302)
        config.refresh_from_db()
        self.assertFalse(config.screenshot_protection_enabled)

        # Post update pricing with toggle checked on
        res2 = self.client.post("/monitor/monetization/update-pricing/", {
            "single_course_price": "1500",
            "all_access_price": "3000",
            "launch_offer_price": "2000",
            "launch_offer_max_buyers": "100",
            "trial_duration_days": "3",
            "semester_end_date": "2027-05-30",
            "screenshot_protection_enabled": "on",
        })
        self.assertEqual(res2.status_code, 302)
        config.refresh_from_db()
        self.assertTrue(config.screenshot_protection_enabled)

    def test_record_university_session_api(self):
        uni_student = User.objects.create_user(
            email="medstudent@example.com",
            username="medstudent",
            password="StudentPass123!",
            user_type="university",
            active_mode="university",
        )
        from rest_framework.authtoken.models import Token
        token = Token.objects.create(user=uni_student)

        # The legacy endpoint must not accept a score asserted by the browser.
        res = self.client.post("/api/sessions/record-university/", {
            "course_code": "ANA 201",
            "topic_title": "Bones of the Upper Limb",
            "total_questions": 20,
            "correct_answers": 16,
            "time_spent_seconds": 480,
            "mode": "timed",
        }, content_type="application/json", HTTP_AUTHORIZATION=f"Token {token.key}")
        self.assertEqual(res.status_code, 410)
        self.assertFalse(PracticeSession.objects.filter(user=uni_student).exists())

    def test_record_aspirant_session_api(self):
        from rest_framework.authtoken.models import Token
        token = Token.objects.create(user=self.student)
        res = self.client.post("/api/sessions/record/", {
            "track": "aspirant",
            "subject_slug": "biology",
            "topic_title": "Cell Biology",
            "total_questions": 15,
            "correct_answers": 12,
            "time_spent_seconds": 300,
            "mode": "timed",
        }, content_type="application/json", HTTP_AUTHORIZATION=f"Token {token.key}")
        self.assertEqual(res.status_code, 410)
        self.assertFalse(PracticeSession.objects.filter(user=self.student).exists())

    def test_dashboard_with_tracks(self):
        # Create an aspirant session and a university session
        self._record_verified_session(self.student, total=10, correct=7)
        self._record_verified_session(self.student, total=25, correct=20, course_code="ANA 201")

        for track in ["all", "aspirant", "university"]:
            res = self.client.get(f"/monitor/?range=7d&track={track}")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.context["track_param"], track)
            self.assertIn("aspirant_subjects", res.context)
            self.assertIn("university_subjects", res.context)
            if track == "aspirant":
                self.assertGreaterEqual(res.context["period_tests"], 1)
            elif track == "university":
                self.assertGreaterEqual(res.context["period_tests"], 1)
            else:
                self.assertGreaterEqual(res.context["period_tests"], 2)

    def test_student_detail_university_diagnostics(self):
        uni_student = User.objects.create_user(
            email="doctortobe@example.com",
            username="doctortobe",
            password="DoctorPass123!",
            user_type="university",
            active_mode="university",
        )
        self._record_verified_session(uni_student, total=20, correct=17, course_code="ANA 201")

        res = self.client.get(f"/monitor/students/{uni_student.public_id}/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("uni_courses_list", res.context)
        self.assertEqual(len(res.context["uni_courses_list"]), 1)
        self.assertEqual(res.context["uni_courses_list"][0]["code"], "ANA 201")
        self.assertEqual(res.context["uni_courses_list"][0]["accuracy"], 85)
        self.assertEqual(res.context["accuracy"], 85)
        self.assertEqual(res.context["total"], 20)

    def test_university_dashboard_view(self):
        self._record_verified_session(self.student, total=15, correct=12, course_code="ANA 201")
        res = self.client.get("/monitor/university/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("courses", res.context)
        self.assertIn("student_list", res.context)
        self.assertIn("recent_sessions", res.context)
        self.assertGreaterEqual(res.context["total_uni_tests_all"], 1)
