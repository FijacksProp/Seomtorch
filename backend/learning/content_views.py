import hashlib
import hmac
import json
import logging
import mimetypes
import re
from functools import lru_cache
from pathlib import Path, PurePosixPath
from urllib.parse import urlencode
import time

from django.conf import settings
from django.http import FileResponse
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from monetization.models import CourseAccess
from monetization.access_policy import limited_access_is_active, limited_access_percentage
from monetization.course_topics import canonical_topic_id
from .access import accessible_university_question_ids, limited_sample_count
from .models import Subject, Topic, Question


REPO_DIR = settings.BASE_DIR.parent
UNIVERSITY_DIR = REPO_DIR / "data" / "university"
NOTES_ASSET_DIR = REPO_DIR / "assets" / "notes"
ACCESS_MANIFEST_PATH = settings.BASE_DIR / ".university-access-manifest.json"
ALLOWED_IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".webp", ".avif"}
_NOTE_MEDIA_BLOCK_POSITIONS = {}
logger = logging.getLogger(__name__)


def _normalized(value):
    return str(value or "").replace("\\", "/").lstrip("./")


def _build_content_access_map():
    """Build the access map from course catalog files and note metadata."""
    global _NOTE_MEDIA_BLOCK_POSITIONS
    content_map = {}
    note_media_positions = {}
    note_files = []
    if not UNIVERSITY_DIR.exists():
        return content_map

    for course_path in UNIVERSITY_DIR.rglob("*.json"):
        if course_path.name in {"index.json", "meta.json", "courses.json"} or course_path.name.startswith(("questions-", "notes-")):
            continue
        try:
            course = json.loads(course_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        course_code = str(course.get("code") or "").strip().upper()
        if not course_code or not isinstance(course.get("sections"), list):
            continue
        for section in course["sections"]:
            topics = section.get("topics") or []
            for topic in topics:
                topic_id = str(topic.get("id") or "").strip()
                for key in ("dataFile", "noteFile"):
                    rel = _normalized(topic.get(key))
                    if rel.startswith("data/university/"):
                        content_map[rel] = (course_code, topic_id)
                        if key == "noteFile":
                            note_files.append((rel, course_code, topic_id))
            for note in section.get("notes") or []:
                rel = _normalized(note.get("noteFile"))
                topic_id = str(note.get("topicId") or "").strip()
                if rel.startswith("data/university/"):
                    content_map[rel] = (course_code, topic_id)
                    note_files.append((rel, course_code, topic_id))
            section_note = _normalized(section.get("noteFile"))
            if section_note.startswith("data/university/"):
                topic_id = str((topics[0] if topics else {}).get("id") or "").strip()
                content_map[section_note] = (course_code, topic_id)
                note_files.append((section_note, course_code, topic_id))

    for note_path in UNIVERSITY_DIR.rglob("notes-*.json"):
        relative_note_path = note_path.relative_to(REPO_DIR).as_posix()
        if relative_note_path in content_map:
            continue
        try:
            note_data = json.loads(note_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        course_code = str(note_data.get("courseCode") or "").strip().upper()
        note_id = str(note_data.get("id") or "")
        code_token = re.sub(r"[^a-z0-9]", "", course_code.lower())
        prefix = f"note-{code_token}-"
        topic_id = note_id[len(prefix):] if note_id.startswith(prefix) else ""
        if course_code:
            content_map[relative_note_path] = (course_code, topic_id)
            note_files.append((relative_note_path, course_code, topic_id))

    for note_rel, course_code, topic_id in note_files:
        note_path = REPO_DIR / Path(*PurePosixPath(note_rel).parts)
        try:
            note_data = json.loads(note_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue

        def collect_images(value, found=None):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key in {"image", "image_url", "imageUrl"} and isinstance(child, str):
                        image_rel = _normalized(child)
                        if image_rel.startswith("assets/notes/"):
                            content_map[image_rel] = (course_code, topic_id)
                            if found is not None:
                                found.add(image_rel)
                    collect_images(child, found)
            elif isinstance(value, list):
                for child in value:
                    collect_images(child, found)

        collect_images(note_data)
        blocks = note_data.get("blocks")
        if isinstance(blocks, list):
            for block_index, block in enumerate(blocks):
                image_paths = set()
                collect_images(block, image_paths)
                for image_path in image_paths:
                    note_media_positions.setdefault(image_path, set()).add((len(blocks), block_index))
    _NOTE_MEDIA_BLOCK_POSITIONS = {path: tuple(positions) for path, positions in note_media_positions.items()}
    return content_map


@lru_cache(maxsize=1)
def _content_access_map():
    """Load the deployment-built private content map; scan only as a dev fallback."""
    global _NOTE_MEDIA_BLOCK_POSITIONS
    manifest_started = time.perf_counter()
    if ACCESS_MANIFEST_PATH.is_file():
        try:
            manifest = json.loads(ACCESS_MANIFEST_PATH.read_text(encoding="utf-8"))
            _NOTE_MEDIA_BLOCK_POSITIONS = {
                path: tuple((int(total), int(index)) for total, index in positions)
                for path, positions in (manifest.get("note_media_positions") or {}).items()
            }
            content_map = {path: (str(value[0]), str(value[1])) for path, value in manifest.get("content_map", {}).items()}
            logger.info("University access manifest loaded entries=%d elapsed=%.3fs", len(content_map), time.perf_counter() - manifest_started)
            return content_map
        except (OSError, ValueError, TypeError, IndexError):
            pass
    content_map = _build_content_access_map()
    logger.warning("University access manifest unavailable; request worker performed fallback scan entries=%d elapsed=%.3fs", len(content_map), time.perf_counter() - manifest_started)
    return content_map


def write_content_access_manifest():
    """Generate the compact per-worker map before Gunicorn starts serving requests."""
    content_map = _build_content_access_map()
    manifest = {
        "content_map": content_map,
        "note_media_positions": _NOTE_MEDIA_BLOCK_POSITIONS,
    }
    temporary = ACCESS_MANIFEST_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    temporary.replace(ACCESS_MANIFEST_PATH)
    _content_access_map.cache_clear()
    return len(content_map)


def _note_image_is_accessible(user, relative_path):
    percentage = limited_access_percentage(user)
    return any(
        block_index < limited_sample_count(total_blocks, percentage)
        for total_blocks, block_index in _NOTE_MEDIA_BLOCK_POSITIONS.get(relative_path, ())
    )


def _resolve_subject_topic(course_code, topic_id, question_rows=None):
    subject = Subject.objects.filter(code__iexact=course_code, track=Subject.Track.UNIVERSITY, is_active=True).first()
    if not subject:
        return None, None
    if topic_id:
        target = canonical_topic_id(course_code, topic_id)
        topic = next((item for item in subject.topics.all() if canonical_topic_id(course_code, item.slug) == target), None)
        if topic:
            return subject, topic
    external_ids = [str(row.get("id") or row.get("external_id") or "") for row in (question_rows or [])]
    external_ids = [item for item in external_ids if item]
    if external_ids:
        matches = list(Question.objects.filter(external_id__in=external_ids, topic__subject=subject, is_active=True).select_related("topic"))
        topic_ids = {item.topic_id for item in matches}
        if len(topic_ids) == 1:
            return subject, matches[0].topic
    return subject, None


def _has_access(user, course_code, *, is_note=False):
    if CourseAccess.user_has_course_access(user, course_code):
        return True
    return limited_access_is_active(user)


def _safe_relative_file(relative_path, root):
    parts = PurePosixPath(relative_path).parts
    if not parts or any(part in {".", ".."} for part in parts):
        return None
    candidate = root.joinpath(*parts).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def _signed_media_url(request, relative_path):
    expires = int(timezone.now().timestamp()) + 900
    user_id = str(request.user.pk)
    payload = f"{user_id}:{relative_path}:{expires}".encode("utf-8")
    signature = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    query = urlencode({"path": relative_path, "user": user_id, "expires": expires, "signature": signature})
    return request.build_absolute_uri(f"/api/content/university-media/?{query}")


def _rewrite_private_images(value, request):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"image", "image_url", "imageUrl"} and isinstance(child, str):
                relative = _normalized(child)
                if relative in _content_access_map() and relative.startswith("assets/notes/"):
                    value[key] = _signed_media_url(request, relative)
            else:
                _rewrite_private_images(child, request)
    elif isinstance(value, list):
        for child in value:
            _rewrite_private_images(child, request)


class UniversityContentView(APIView):
    """Deliver course files only to authenticated students entitled to them."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        request_started = time.perf_counter()
        worker_cache_warm = _content_access_map.cache_info().currsize > 0
        relative = _normalized(request.query_params.get("path"))
        if not relative.startswith("data/university/") or not relative.endswith(".json"):
            return Response({"detail": "University content was not found."}, status=status.HTTP_404_NOT_FOUND)
        path = _safe_relative_file(relative, REPO_DIR)
        if not path or not path.is_file() or path.stat().st_size > 8 * 1024 * 1024:
            return Response({"detail": "University content was not found."}, status=status.HTTP_404_NOT_FOUND)

        entitlement = _content_access_map().get(relative)
        is_metadata = path.name in {"index.json", "meta.json", "courses.json"}
        if not entitlement and not is_metadata:
            try:
                outline = json.loads(path.read_text(encoding="utf-8"))
                is_metadata = bool(outline.get("code") and isinstance(outline.get("sections"), list))
            except (OSError, json.JSONDecodeError):
                is_metadata = False
        if not entitlement and not is_metadata:
            return Response({"detail": "University content was not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return Response({"detail": "This course file could not be read."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        if entitlement:
            course_code, topic_id = entitlement
            is_note = path.name.startswith("notes-") or "blocks" in data
            if not _has_access(request.user, course_code, is_note=is_note):
                return Response({"detail": "University access is required to open this content."}, status=status.HTTP_403_FORBIDDEN)

            if path.name.startswith("questions-"):
                subject, topic = _resolve_subject_topic(course_code, topic_id, data.get("questions"))
                if not subject:
                    return Response({"detail": "University content was not found."}, status=status.HTTP_404_NOT_FOUND)
                full_course_access = CourseAccess.user_has_course_access(request.user, course_code)
                if not full_course_access and not topic:
                    return Response({"detail": "This question sample is not currently available."}, status=status.HTTP_403_FORBIDDEN)
                allowed = accessible_university_question_ids(request.user, subject, topic)
                if allowed is not None:
                    data["questions"] = [
                        item for item in (data.get("questions") or [])
                        if str(item.get("id") or item.get("external_id") or "") in allowed
                    ]
                    for item in data["questions"]:
                        for key in ("correct", "correctAnswer", "answer", "explanation"):
                            item.pop(key, None)
                    data["totalQuestions"] = len(data["questions"])
                    data["limitedAccess"] = True
                    data["accessPercentage"] = limited_access_percentage(request.user)
                    data["accessibleQuestionCount"] = len(data["questions"])
                if not data.get("questions"):
                    return Response({"detail": "This question sample is not currently available."}, status=status.HTTP_403_FORBIDDEN)

            if is_note and isinstance(data.get("blocks"), list) and not CourseAccess.user_has_course_access(request.user, course_code):
                full_blocks = data["blocks"]
                access_percentage = limited_access_percentage(request.user)
                accessible_count = limited_sample_count(len(full_blocks), access_percentage)
                data["totalBlocks"] = len(full_blocks)
                data["accessibleBlocks"] = accessible_count
                data["limitedAccess"] = True
                data["accessPercentage"] = access_percentage
                data["lockedBlocks"] = [
                    {"id": block.get("id"), "number": block.get("number"), "title": block.get("title", "Locked study note"), "category": block.get("category", "Study note"), "isLocked": True}
                    for block in full_blocks[accessible_count:]
                ]
                data["blocks"] = full_blocks[:accessible_count]
                data["glossary"] = []
                data["checklist"] = []
            _rewrite_private_images(data, request)
        response = Response(data)
        response["Cache-Control"] = "private, no-store"
        response["Vary"] = "Authorization"
        elapsed = time.perf_counter() - request_started
        if elapsed >= 1.0:
            logger.warning("Slow university content request path=%s worker_cache=%s elapsed=%.3fs", relative, "warm" if worker_cache_warm else "cold", elapsed)
        else:
            logger.info("University content request path=%s worker_cache=%s elapsed=%.3fs", relative, "warm" if worker_cache_warm else "cold", elapsed)
        return response


class UniversityMediaView(APIView):
    """Serve note diagrams through short-lived signed URLs, never public assets."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        relative = _normalized(request.query_params.get("path"))
        try:
            expires = int(request.query_params.get("expires", "0"))
        except (TypeError, ValueError):
            expires = 0
        signature = str(request.query_params.get("signature") or "")
        user_id = str(request.query_params.get("user") or "")
        now = int(timezone.now().timestamp())
        if not relative.startswith("assets/notes/") or expires < now or expires > now + 960:
            return Response(status=status.HTTP_403_FORBIDDEN)
        expected = hmac.new(
            settings.SECRET_KEY.encode("utf-8"),
            f"{user_id}:{relative}:{expires}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        entitlement = _content_access_map().get(relative)
        if not user_id.isdigit() or not hmac.compare_digest(expected, signature) or not entitlement:
            return Response(status=status.HTTP_403_FORBIDDEN)
        from django.contrib.auth import get_user_model
        media_user = get_user_model().objects.filter(pk=user_id).first()
        has_full_access = bool(media_user and CourseAccess.user_has_course_access(media_user, entitlement[0]))
        has_limited_image_access = bool(
            media_user
            and _note_image_is_accessible(media_user, relative)
            and limited_access_is_active(media_user)
        )
        if not media_user or not (has_full_access or has_limited_image_access):
            return Response(status=status.HTTP_403_FORBIDDEN)
        path = _safe_relative_file(relative, REPO_DIR)
        if not path or not path.is_file() or path.suffix.lower() not in ALLOWED_IMAGE_TYPES:
            return Response(status=status.HTTP_404_NOT_FOUND)
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        response = FileResponse(path.open("rb"), content_type=content_type)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
