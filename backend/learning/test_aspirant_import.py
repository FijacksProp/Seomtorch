import io
import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Question, QuestionBankRelease, Subject


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AspirantImportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("import_questions", stdout=io.StringIO())
        cls.student = get_user_model().objects.create_user(
            email="aspirant-import@example.com",
            username="aspirant-import",
            password="TestOnlyPassword123!",
            user_type="aspirant",
            active_mode="aspirant",
        )

    def setUp(self):
        self.client.force_authenticate(user=self.student)

    def test_all_manifest_subjects_are_imported_and_startable(self):
        root = Path(settings.BASE_DIR).parent
        manifest = json.loads((root / "data" / "manifest.json").read_text(encoding="utf-8"))
        for pack in manifest["packs"]:
            slug = pack["id"]
            payload = json.loads((root / pack["file"]).read_text(encoding="utf-8"))
            expected = len(payload["questions"])
            with self.subTest(subject=slug):
                active_count = Question.objects.filter(
                    topic__subject__slug=slug,
                    topic__subject__track=Subject.Track.ASPIRANT,
                    is_active=True,
                ).count()
                self.assertEqual(active_count, expected)
                res = self.client.post(
                    "/api/sessions/",
                    {"subject": slug, "limit": 10, "mode": "normal"},
                    format="json",
                )
                self.assertEqual(res.status_code, 201, res.data)
                self.assertEqual(len(res.data["questions"]), 10)

    def test_if_current_repairs_subject_with_no_active_questions(self):
        Question.objects.filter(topic__subject__slug="computer-studies").update(is_active=False)
        self.assertEqual(
            Question.objects.filter(topic__subject__slug="computer-studies", is_active=True).count(),
            0,
        )
        call_command("import_questions", if_current=True, stdout=io.StringIO())
        self.assertEqual(
            Question.objects.filter(topic__subject__slug="computer-studies", is_active=True).count(),
            935,
        )
