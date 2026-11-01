import hashlib
import hmac
import json
import mimetypes
import re
from functools import lru_cache
from pathlib import Path, PurePosixPath
from urllib.parse import urlencode

from django.conf import settings
from django.http import FileResponse
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from monetization.models import CourseAccess, CourseTopicConfig


REPO_DIR = settings.BASE_DIR.parent
UNIVERSITY_DIR = REPO_DIR / "data" / "university"
NOTES_ASSET_DIR = REPO_DIR / "assets" / "notes"
DEFAULT_FREE_TOPICS = {"ANA 201": "ul-bones", "ANA 203": "week-one", "PIO 201": "transport-homeostasis"}
ALLOWED_IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".webp", ".avif"}


def _normalized(value):
    return str(value or "").replace("\\", "/").lstrip("./")


@lru_cache(maxsize=1)
def _content_access_map():
    """Map private question/note files and note images to their course/topic."""
    content_map = {}
    note_files = []
    if not UNIVERSITY_DIR.exists():
        return content_map

    for course_path in UNIVERSITY_DIR.rglob("*.json"):
        if course_path.name in {"index.json", "meta.json", "courses.json"}:
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

        def collect_images(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key in {"image", "image_url", "imageUrl"} and isinstance(child, str):
                        image_rel = _normalized(child)
                        if image_rel.startswith("assets/notes/"):
                            content_map[image_rel] = (course_code, topic_id)
                    collect_images(child)
            elif isinstance(value, list):
                for child in value:
                    collect_images(child)

        collect_images(note_data)
    return content_map


def _has_access(user, course_code, topic_id=""):
    if CourseAccess.user_has_course_access(user, course_code):
        return True
    configured = CourseTopicConfig.objects.filter(course_code__iexact=course_code).values_list("free_topic_id", flat=True).first()
    free_topic_id = configured or next((topic for code, topic in DEFAULT_FREE_TOPICS.items() if code.upper() == course_code.upper()), "")
    return bool(free_topic_id and topic_id and free_topic_id.casefold() == topic_id.casefold())


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
    payload = f"{relative_path}:{expires}".encode("utf-8")
    signature = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    query = urlencode({"path": relative_path, "expires": expires, "signature": signature})
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
        if entitlement and not _has_access(request.user, *entitlement):
            return Response({"detail": "Course access is required to open this content."}, status=status.HTTP_403_FORBIDDEN)
        if path.name.startswith("questions-") and not entitlement:
            return Response({"detail": "University content was not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return Response({"detail": "This course file could not be read."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        if entitlement:
            _rewrite_private_images(data, request)
        response = Response(data)
        response["Cache-Control"] = "private, no-store"
        response["Vary"] = "Authorization"
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
        now = int(timezone.now().timestamp())
        if not relative.startswith("assets/notes/") or expires < now or expires > now + 960:
            return Response(status=status.HTTP_403_FORBIDDEN)
        expected = hmac.new(
            settings.SECRET_KEY.encode("utf-8"),
            f"{relative}:{expires}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature) or relative not in _content_access_map():
            return Response(status=status.HTTP_403_FORBIDDEN)
        path = _safe_relative_file(relative, REPO_DIR)
        if not path or not path.is_file() or path.suffix.lower() not in ALLOWED_IMAGE_TYPES:
            return Response(status=status.HTTP_404_NOT_FOUND)
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        response = FileResponse(path.open("rb"), content_type=content_type)
        response["Cache-Control"] = "private, max-age=300"
        response["X-Content-Type-Options"] = "nosniff"
        return response
