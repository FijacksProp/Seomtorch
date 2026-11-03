import io
import json
import uuid
from datetime import timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from monetization.course_topics import DEFAULT_FREE_TOPICS
from monetization.models import CourseAccess, CourseTopicConfig
from .management.commands.import_questions import Command
from .models import Attempt, Bookmark, PracticeSession, Question, Subject, Topic


def university_catalog_topics():
    root = Path(settings.BASE_DIR).parent
    for path in sorted((root / "data" / "university").rglob("*.json")):
        if path.name.startswith(("questions-", "notes-")):
            continue
        catalog = json.loads(path.read_text(encoding="utf-8"))
        if not catalog.get("code") or not isinstance(catalog.get("sections"), list):
            continue
        for section in catalog["sections"]:
            for topic in section.get("topics", []):
                if topic.get("dataFile"):
                    payload = json.loads((root / topic["dataFile"]).read_text(encoding="utf-8"))
                    yield catalog, topic, payload


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class UniversityImportTests(APITestCase):
    """Exercise the shipped catalogs and question files, not synthetic slugs."""

    @classmethod
    def setUpTestData(cls):
        call_command("import_questions", university_only=True, stdout=io.StringIO())
        cls.student = get_user_model().objects.create_user(
            email="university-import@example.com", username="university-import",
            password="TestOnlyPassword123!",
        )
        CourseAccess.objects.create(
            user=cls.student, access_type=CourseAccess.AccessType.ALL_ACCESS,
            expires_at=timezone.now() + timedelta(days=30),
        )

    def setUp(self):
        self.client.force_authenticate(user=self.student)

    def _start(self, catalog, topic, payload):
        selected = payload["questions"][:10]
        return self.client.post("/api/sessions/", {
            "subject": catalog["code"].lower().replace(" ", "-"),
            "topic": topic["id"],
            "topic_name": topic["title"],
            "question_ids": [question["id"] for question in selected],
            "limit": len(selected), "mode": "timed", "duration_minutes": 30,
        }, format="json")

    def test_all_real_question_files_use_the_catalog_topic_ids(self):
        actual = {
            row["external_id"]: row
            for row in Question.objects.filter(topic__subject__track=Subject.Track.UNIVERSITY).values(
                "external_id", "topic__slug", "topic__subject__code", "correct_index", "is_active",
            )
        }
        expected_count = 0
        for catalog, topic, payload in university_catalog_topics():
            for question in payload["questions"]:
                with self.subTest(question=question["id"]):
                    imported = actual[question["id"]]
                    self.assertEqual(imported["topic__slug"], topic["id"])
                    self.assertEqual(imported["topic__subject__code"], catalog["code"])
                    self.assertEqual(imported["correct_index"], question["correct"])
                    self.assertTrue(imported["is_active"])
                    expected_count += 1
        self.assertEqual(len(actual), expected_count)

    def test_subscriber_can_start_every_shipped_university_topic(self):
        for catalog, topic, payload in university_catalog_topics():
            with self.subTest(course=catalog["code"], topic=topic["id"]):
                response = self._start(catalog, topic, payload)
                self.assertEqual(response.status_code, 201, response.data)
                session = PracticeSession.objects.get(id=response.data["session_id"])
                self.assertEqual(session.topic.slug, topic["id"])
                self.assertEqual(len(response.data["questions"]), 10)

    def test_real_bones_timed_session_can_be_started_scored_and_completed(self):
        root = Path(settings.BASE_DIR).parent
        payload = json.loads((root / "data/university/anatomy/200/questions-ana201-bones.json").read_text(encoding="utf-8"))
        started = self.client.post("/api/sessions/", {
            "subject": "ana-201", "topic": "ul-bones", "topic_name": payload["title"],
            "question_ids": [question["id"] for question in payload["questions"]],
            "limit": 100, "mode": "timed", "duration_minutes": 30,
        }, format="json")
        self.assertEqual(started.status_code, 201, started.data)
        session_id = started.data["session_id"]
        began = self.client.post(f"/api/sessions/{session_id}/begin/", {}, format="json")
        self.assertEqual(began.status_code, 200, began.data)
        recorded = self.client.post("/api/attempts/bulk/", {
            "session_id": session_id,
            "attempts": [
                {"question_id": question["id"], "selected_index": question["correct"], "client_id": str(uuid.uuid4())}
                for question in payload["questions"]
            ],
        }, format="json")
        self.assertEqual(recorded.status_code, 200, recorded.data)
        self.assertEqual(len(recorded.data["results"]), 100)
        self.assertTrue(all(item["correct"] for item in recorded.data["results"]))
        completed = self.client.post(f"/api/sessions/{session_id}/complete/", {}, format="json")
        self.assertEqual(completed.status_code, 200, completed.data)
        self.assertEqual(completed.data["correct"], 100)
        self.assertEqual(completed.data["stats"]["xp"], 500)

    def test_default_free_topics_work_for_content_and_practice(self):
        CourseAccess.objects.filter(user=self.student).delete()
        for catalog, topic, payload in university_catalog_topics():
            if topic["id"] != DEFAULT_FREE_TOPICS.get(catalog["code"]):
                continue
            with self.subTest(course=catalog["code"]):
                content = self.client.get("/api/content/university/", {"path": topic["dataFile"]})
                self.assertEqual(content.status_code, 200, content.data)
                started = self._start(catalog, topic, payload)
                self.assertEqual(started.status_code, 201, started.data)

    def test_legacy_admin_free_topic_setting_keeps_its_meaning(self):
        CourseAccess.objects.filter(user=self.student).delete()
        CourseTopicConfig.objects.create(course_code="ANA 203", free_topic_id="week-one")
        for catalog, topic, payload in university_catalog_topics():
            if catalog["code"] == "ANA 203" and topic["id"] == "ge-week-one":
                content = self.client.get("/api/content/university/", {"path": topic["dataFile"]})
                self.assertEqual(content.status_code, 200, content.data)
                started = self._start(catalog, topic, payload)
                self.assertEqual(started.status_code, 201, started.data)
                break
        else:
            self.fail("The real ANA 203 week-one topic is missing")

    def test_reimport_repairs_legacy_topic_without_losing_progress(self):
        question = Question.objects.select_related("topic").get(external_id="ana201-bones-1")
        original_pk, original_text = question.pk, question.text
        original_topic_pk = question.topic_id
        topic = question.topic
        topic.slug = "bones-of-the-upper-limb"
        topic.save(update_fields=("slug",))
        session = PracticeSession.objects.create(
            user=self.student, subject=topic.subject, topic=topic,
            total_questions=1, question_ids=[question.external_id],
        )
        attempt = Attempt.objects.create(
            user=self.student, question=question, session=session, client_id=uuid.uuid4(),
            selected_index=question.correct_index, is_correct=True, xp_earned=5,
        )
        Bookmark.objects.create(user=self.student, question=question)
        Question.objects.filter(pk=original_pk).update(text="Text needing refresh", is_active=False)
        # A university-only repair must not deactivate unrelated aspirant data.
        aspirant = Subject.objects.get(slug="english")
        aspirant_topic = Topic.objects.create(subject=aspirant, slug="test-sentinel", name="Sentinel")
        sentinel = Question.objects.create(
            external_id="aspirant-import-sentinel", topic=aspirant_topic,
            text="Keep active", options=["A", "B"], correct_index=0,
        )

        call_command("import_questions", university_only=True, stdout=io.StringIO())

        question.refresh_from_db()
        session.refresh_from_db()
        attempt.refresh_from_db()
        sentinel.refresh_from_db()
        self.assertEqual(question.pk, original_pk)
        self.assertEqual(question.text, original_text)
        self.assertTrue(question.is_active)
        self.assertEqual(question.topic_id, original_topic_pk)
        self.assertEqual(question.topic.slug, "ul-bones")
        self.assertEqual(session.topic_id, original_topic_pk)
        self.assertEqual(attempt.question_id, original_pk)
        self.assertTrue(Bookmark.objects.filter(user=self.student, question_id=original_pk).exists())
        self.assertTrue(sentinel.is_active)

    def test_unchanged_bank_is_skipped_on_restart(self):
        with patch.object(Command, "_process_university_questions", side_effect=AssertionError("Unexpected reimport")):
            call_command("import_questions", university_only=True, if_current=True, stdout=io.StringIO())

    def test_missing_source_files_fail_with_deployment_instructions(self):
        missing_root = Path(settings.BASE_DIR) / "not-a-deployment-source-directory"
        with self.assertRaisesMessage(CommandError, "leave Root Directory blank"):
            Command()._sync_university_questions(missing_root, set(), if_current=True)

    def test_unlinked_question_file_is_not_imported_under_a_guessed_topic(self):
        root, base, question_path = MagicMock(), MagicMock(), MagicMock()
        root.__truediv__.return_value.__truediv__.return_value = base
        base.exists.return_value = True
        base.rglob.side_effect = lambda pattern: [question_path] if pattern == "questions-*.json" else []
        question_path.read_text.return_value = json.dumps({
            "course": "ANA 201", "title": "Orphan", "questions": [],
        })
        question_path.relative_to.return_value.as_posix.return_value = "data/university/questions-orphan.json"
        with self.assertRaisesMessage(CommandError, "not linked from a course catalog"):
            Command()._process_university_questions(root, set())
