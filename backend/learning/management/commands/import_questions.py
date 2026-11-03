import hashlib
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from learning.models import Question, QuestionBankRelease, Subject, Topic

SUBJECT_DETAILS = {
    "biology": ("Biology", "JAMB cell biology, physiology, ecology, genetics and evolution", 1),
    "chemistry": ("Chemistry", "JAMB physical, inorganic and organic chemistry", 2),
    "civic-education": ("Civic Education", "WAEC & JAMB citizenship, human rights, democracy and governance", 3),
    "computer-studies": ("Computer Studies", "Hardware, software, networking, logic, programming and data processing", 4),
    "economics": ("Economics", "Microeconomics, macroeconomics, national income, trade and public finance", 5),
    "english": ("English Language", "Usage, comprehension and oral forms", 6),
    "general-paper": ("General Paper", "Civics, current affairs and general knowledge", 7),
    "government": ("Government", "Political theories, Nigerian constitutional development, institutions and foreign policy", 8),
    "history": ("History", "Nigerian, African and world history from pre-colonial to modern times", 9),
    "literature-in-english": ("Literature in English", "Literary devices, African and non-African prose, drama, and poetry", 10),
    "marketing": ("Marketing", "Marketing concepts, 4Ps, distribution channels, promotion and consumer behavior", 11),
    "mathematics": ("Mathematics", "Numbers, algebra, geometry and calculus", 12),
    "music": ("Music", "JAMB music theory, African music and Western art music", 13),
    "physics": ("Physics", "JAMB mechanics, waves, electricity and modern physics", 14),
}

class Command(BaseCommand):
    help = "Import or update the versioned Seomtorch JSON question bank."

    def add_arguments(self, parser):
        default = Path(__file__).resolve().parents[4] / "data" / "questions.json"
        parser.add_argument("path", nargs="?", default=str(default))
        parser.add_argument(
            "--university-only",
            action="store_true",
            help="Import university courses without processing or deactivating the aspirant bank.",
        )
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
        if options["if_empty"] and not options["university_only"] and Question.objects.exists():
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

        if options["university_only"]:
            seen = set()
            created, updated = self._sync_university_questions(repo_root, seen, if_current=options["if_current"])
            self.stdout.write(self.style.SUCCESS(
                f"University question bank ready: {created} created, {updated} updated."
            ))
            return

        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path and manifest_path.exists() else None
        release_version = str(manifest.get("version")) if manifest else None
        if options["if_current"] and release_version and QuestionBankRelease.objects.filter(version=release_version).exists():
            university_seen = set()
            created, updated = self._sync_university_questions(repo_root, university_seen, if_current=True)
            self.stdout.write(
                f"Aspirant question bank v{release_version} is current; university content checked: "
                f"{created} created, {updated} updated."
            )
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

        # University question sets are also imported server-side. That lets
        # timed sessions be scored against the database instead of trusting a
        # score submitted by the browser.
        university_created, university_updated = self._sync_university_questions(repo_root, seen)
        created += university_created
        updated += university_updated

        deactivated = Question.objects.exclude(external_id__in=seen).update(is_active=False)
        if release_version:
            QuestionBankRelease.objects.update_or_create(version=release_version, defaults={"question_count": len(seen)})
        self.stdout.write(self.style.SUCCESS(f"Imported {len(seen)} questions: {created} created, {updated} updated, {deactivated} deactivated."))

    def _sync_university_questions(self, repo_root, seen, if_current=False):
        base = repo_root / "data" / "university"
        if not base.exists() or not any(base.rglob("questions-*.json")):
            raise CommandError(
                "University question source files are missing. On Render, leave Root Directory blank "
                "and use Build Command 'bash backend/build.sh' and Start Command 'bash backend/start.sh'."
            )
        # Include catalogs as well as questions: correcting a catalog topic ID
        # must trigger a repair even when the question content is unchanged.
        digest = hashlib.sha256(b"university-import-v2")
        for path in sorted(base.rglob("*.json")):
            if path.name.startswith("notes-"):
                continue
            digest.update(path.relative_to(repo_root).as_posix().encode("utf-8"))
            digest.update(path.read_bytes())
        version = f"uni2-{digest.hexdigest()[:32]}"
        if if_current and QuestionBankRelease.objects.filter(version=version).exists():
            return 0, 0
        university_seen = set()
        created, updated = self._process_university_questions(repo_root, university_seen)
        QuestionBankRelease.objects.update_or_create(
            version=version, defaults={"question_count": len(university_seen)},
        )
        seen.update(university_seen)
        return created, updated

    def _process_university_questions(self, repo_root, seen):
        base = repo_root / "data" / "university"
        if not base.exists():
            return 0, 0

        # Match by the catalog's explicit dataFile path, never by guessing a
        # filename from "ANA 201" (the actual outline is ana201.json).
        catalog_topics = {}
        for catalog_path in sorted(base.rglob("*.json")):
            if catalog_path.name.startswith(("questions-", "notes-")):
                continue
            try:
                catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise CommandError(f"Could not read university catalog {catalog_path}: {exc}") from exc
            if not catalog.get("code") or not isinstance(catalog.get("sections"), list):
                continue
            for section in catalog["sections"]:
                for topic_info in section.get("topics", []):
                    relative_path = str(topic_info.get("dataFile") or "").replace("\\", "/").removeprefix("./")
                    if relative_path:
                        catalog_topics[relative_path] = (catalog, topic_info)

        created = updated = 0
        subjects = {}
        for question_path in sorted(base.rglob("questions-*.json")):
            try:
                payload = json.loads(question_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise CommandError(f"Could not read university question file {question_path}: {exc}") from exc

            relative_question_path = question_path.relative_to(repo_root).as_posix()
            if relative_question_path not in catalog_topics:
                raise CommandError(f"University question file is not linked from a course catalog: {relative_question_path}")
            course_data, topic_info = catalog_topics[relative_question_path]
            course_code = str(course_data.get("code") or payload.get("course") or "").strip().upper()
            if not course_code:
                raise CommandError(f"University question file has no course code: {question_path}")
            topic_id = str(topic_info.get("id") or "").strip()
            subject_slug = slugify(course_code)
            if subject_slug not in subjects:
                subject, _ = Subject.objects.update_or_create(
                    slug=subject_slug,
                    defaults={
                        "name": str(course_data.get("title") or course_code)[:120],
                        "description": str(course_data.get("description") or "")[:240],
                        "track": Subject.Track.UNIVERSITY,
                        "code": course_code,
                        "position": 100,
                        "is_active": True,
                    },
                )
                subjects[subject_slug] = subject
            subject = subjects[subject_slug]
            topic_name = str(topic_info.get("title") or payload.get("title") or topic_id or "Course Practice").strip()[:160]
            canonical_slug = slugify(topic_id or topic_name)
            topic = Topic.objects.filter(subject=subject, slug=canonical_slug).first()
            if topic is None:
                # Repair the old title-derived topic in place, preserving its
                # primary key and any historical sessions referencing it.
                legacy_slug = slugify(str(payload.get("title") or ""))
                topic = Topic.objects.filter(subject=subject, slug=legacy_slug).first() if legacy_slug else None
            if topic is None:
                topic = Topic.objects.create(subject=subject, slug=canonical_slug, name=topic_name)
            elif topic.slug != canonical_slug or topic.name != topic_name:
                topic.slug, topic.name = canonical_slug, topic_name
                topic.save(update_fields=("slug", "name"))

            rows = {}
            for item in payload.get("questions", []):
                if not isinstance(item, dict) or not item.get("id") or not isinstance(item.get("options"), list):
                    continue
                try:
                    correct_index = int(item.get("correct"))
                except (TypeError, ValueError):
                    continue
                if not 0 <= correct_index < len(item["options"]):
                    continue
                external_id = str(item["id"]).strip()
                if external_id in rows or external_id in seen:
                    raise CommandError(f"Duplicate university question ID: {external_id}")
                defaults = {
                    "topic": topic,
                    "text": str(item.get("text") or ""),
                    "options": item["options"],
                    "correct_index": correct_index,
                    "explanation": str(item.get("explanation") or ""),
                    "explanation_status": "reviewed" if item.get("explanation") else "missing",
                    "difficulty": str(item.get("difficulty") or "standard"),
                    "source": "Seomtorch university question bank",
                    "question_year": item.get("questionYear"),
                    "image_url": str(item.get("image_url") or item.get("image") or ""),
                    "is_active": True,
                    "updated_at": timezone.now(),
                }
                rows[external_id] = defaults
            if rows:
                existing_ids = set(Question.objects.filter(external_id__in=rows).order_by().values_list("external_id", flat=True))
                # A few batched writes replace thousands of remote round trips.
                # Conflict updates preserve Question PKs, attempts and bookmarks.
                Question.objects.bulk_create(
                    [Question(external_id=external_id, **defaults) for external_id, defaults in rows.items()],
                    update_conflicts=True,
                    unique_fields=["external_id"],
                    update_fields=list(next(iter(rows.values()))),
                    batch_size=100,
                )
                created += len(rows) - len(existing_ids)
                updated += len(existing_ids)
                seen.update(rows)
        return created, updated

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
