import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from learning.models import Question, QuestionBankRelease, Subject, Topic

SUBJECT_DETAILS = {
    "biology": ("Biology", "JAMB cell biology, physiology, ecology, genetics and evolution", 1),
    "english": ("English Language", "Usage, comprehension and oral forms", 2),
    "general-paper": ("General Paper", "Civics, current affairs and general knowledge", 3),
    "mathematics": ("Mathematics", "Numbers, algebra and applied reasoning", 4),
    "physics": ("Physics", "JAMB mechanics, waves, electricity and modern physics", 5),
}

class Command(BaseCommand):
    help = "Import or update the versioned Seomtorch JSON question bank."

    def add_arguments(self, parser):
        default = Path(__file__).resolve().parents[4] / "data" / "questions.json"
        parser.add_argument("path", nargs="?", default=str(default))
        parser.add_argument(
            "--if-empty",
            action="store_true",
            help="Skip the import when the question bank already contains questions.",
        )
        parser.add_argument(
            "--if-current",
            action="store_true",
            help="Skip when this manifest version has already been imported.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["if_empty"] and Question.objects.exists():
            self.stdout.write("Question bank already populated; skipping import.")
            return

        candidate_roots = [
            Path(__file__).resolve().parents[4],
            Path(__file__).resolve().parents[3],
            Path.cwd(),
            Path.cwd().parent,
        ]
        manifest_path = None
        repo_root = Path(__file__).resolve().parents[4]
        for candidate in candidate_roots:
            p = candidate / "data" / "manifest.json"
            if p.exists():
                manifest_path = p
                repo_root = candidate
                break

        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path and manifest_path.exists() else None
        release_version = str(manifest.get("version")) if manifest else None
        if options["if_current"] and release_version and QuestionBankRelease.objects.filter(version=release_version).exists():
            self.stdout.write(f"Question bank v{release_version} already imported; skipping.")
            return

        seen = set(); created = updated = 0

        if manifest:
            for pack in manifest.get("packs", []):
                pack_file = repo_root / pack["file"]
                if pack_file.exists():
                    payload = json.loads(pack_file.read_text(encoding="utf-8"))
                    c, u = self._process_questions(payload.get("questions", []), seen)
                    created += c; updated += u
        else:
            path = Path(options["path"])
            if not path.exists(): raise CommandError(f"Question bank not found: {path}")
            payload = json.loads(path.read_text(encoding="utf-8"))
            c, u = self._process_questions(payload.get("questions", []), seen)
            created += c; updated += u

        deactivated = Question.objects.exclude(external_id__in=seen).update(is_active=False)
        if release_version:
            QuestionBankRelease.objects.update_or_create(version=release_version, defaults={"question_count": len(seen)})
        self.stdout.write(self.style.SUCCESS(f"Imported {len(seen)} questions: {created} created, {updated} updated, {deactivated} deactivated."))

    def _process_questions(self, questions, seen):
        created = updated = 0
        from learning.models import Passage
        for item in questions:
            subject_slug = item["subject"]
            name, description, position = SUBJECT_DETAILS.get(subject_slug, (subject_slug.replace("-", " ").title(), "", 99))
            subject, _ = Subject.objects.update_or_create(slug=subject_slug, defaults={"name": name, "description": description, "position": position, "is_active": True})

            topic_slug = slugify(item["topic"])
            topic, _ = Topic.objects.get_or_create(subject=subject, slug=topic_slug, defaults={"name": item["topic"]})

            passage = None
            if "passage_title" in item or "passage_body" in item:
                passage, _ = Passage.objects.get_or_create(
                    subject=subject,
                    title=item.get("passage_title", ""),
                    body=item.get("passage_body", ""),
                    defaults={"source": item.get("source", "")}
                )

            defaults = {
                "topic": topic,
                "passage": passage,
                "text": item["text"],
                "options": item["options"],
                "correct_index": item["correct"],
                "explanation": item.get("explanation", ""),
                "explanation_status": item.get("explanationStatus", "reviewed"),
                "explanation_image_url": item.get("explanation_image_url", ""),
                "quality_flags": item.get("quality_flags", []),
                "difficulty": item.get("difficulty", "standard"),
                "source": item.get("source", ""),
                "question_year": item.get("questionYear"),
                "video_url": item.get("video_url", ""),
                "image_url": item.get("image_url", ""),
                "source_url": item.get("source_url", ""),
                "is_active": True
            }
            _, was_created = Question.objects.update_or_create(external_id=item["id"], defaults=defaults)
            created += int(was_created); updated += int(not was_created); seen.add(item["id"])
        return created, updated
