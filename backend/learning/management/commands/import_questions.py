import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from learning.models import Question, Subject, Topic

SUBJECT_DETAILS = {
    "english": ("English Language", "Usage, comprehension and oral forms", 1),
    "general-paper": ("General Paper", "Civics, current affairs and general knowledge", 2),
    "mathematics": ("Mathematics", "Numbers, algebra and applied reasoning", 3),
}

class Command(BaseCommand):
    help = "Import or update the versioned Seomtorch JSON question bank."

    def add_arguments(self, parser):
        default = Path(__file__).resolve().parents[4] / "data" / "questions.json"
        parser.add_argument("path", nargs="?", default=str(default))

    @transaction.atomic
    def handle(self, *args, **options):
        path = Path(options["path"])
        if not path.exists(): raise CommandError(f"Question bank not found: {path}")
        payload = json.loads(path.read_text(encoding="utf-8"))
        seen = set(); created = updated = 0
        for item in payload.get("questions", []):
            subject_slug = item["subject"]
            name, description, position = SUBJECT_DETAILS.get(subject_slug, (subject_slug.replace("-", " ").title(), "", 99))
            subject, _ = Subject.objects.update_or_create(slug=subject_slug, defaults={"name": name, "description": description, "position": position, "is_active": True})
            topic_slug = slugify(item["topic"])
            topic, _ = Topic.objects.get_or_create(subject=subject, slug=topic_slug, defaults={"name": item["topic"]})
            defaults = {"topic": topic, "text": item["text"], "options": item["options"], "correct_index": item["correct"], "explanation": item["explanation"], "difficulty": item.get("difficulty", "standard"), "source": item.get("source", ""), "question_year": item.get("questionYear"), "is_active": True}
            _, was_created = Question.objects.update_or_create(external_id=item["id"], defaults=defaults)
            created += int(was_created); updated += int(not was_created); seen.add(item["id"])
        deactivated = Question.objects.exclude(external_id__in=seen).update(is_active=False)
        self.stdout.write(self.style.SUCCESS(f"Imported {len(seen)} questions: {created} created, {updated} updated, {deactivated} deactivated."))
