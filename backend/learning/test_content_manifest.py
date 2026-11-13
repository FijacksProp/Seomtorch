import json
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase

from . import content_views

class UniversityContentManifestTests(SimpleTestCase):
    def tearDown(self):
        content_views._content_access_map.cache_clear()

    def test_worker_loads_prebuilt_manifest_without_scanning_content_tree(self):
        manifest_data = json.dumps({
                "content_map": {"data/university/sample/questions-topic.json": ["ANA 201", "bones"]},
                "note_media_positions": {"assets/notes/sample.webp": [[12, 2]]},
            })
        with patch.object(content_views, "ACCESS_MANIFEST_PATH", Path("access-manifest.json")), patch.object(
            content_views.Path, "is_file", return_value=True,
        ), patch.object(content_views.Path, "read_text", return_value=manifest_data), patch.object(
            content_views, "_build_content_access_map", side_effect=AssertionError("request-time scan"),
        ):
            content_views._content_access_map.cache_clear()
            self.assertEqual(
                content_views._content_access_map(),
                {"data/university/sample/questions-topic.json": ("ANA 201", "bones")},
            )
            self.assertEqual(content_views._NOTE_MEDIA_BLOCK_POSITIONS["assets/notes/sample.webp"], ((12, 2),))

    def test_manifest_builder_maps_catalog_content_before_request_time(self):
        manifest_path = Path("private/access-manifest.json")
        content_map = {
            "data/university/sample/questions-bones.json": ("ANA 201", "bones"),
            "data/university/sample/notes-bones.json": ("ANA 201", "bones"),
        }
        with patch.object(content_views, "ACCESS_MANIFEST_PATH", manifest_path), patch.object(
            content_views, "_build_content_access_map", return_value=content_map,
        ), patch.object(content_views, "_NOTE_MEDIA_BLOCK_POSITIONS", {"assets/notes/bone.webp": ((12, 2),)}), patch.object(
            content_views.Path, "write_text",
        ) as write_text, patch.object(content_views.Path, "replace") as replace:
            count = content_views.write_content_access_manifest()
            self.assertEqual(count, 2)
            written = json.loads(write_text.call_args.args[0])
            self.assertEqual(written["content_map"]["data/university/sample/questions-bones.json"], ["ANA 201", "bones"])
            self.assertEqual(written["note_media_positions"]["assets/notes/bone.webp"], [[12, 2]])
            replace.assert_called_once_with(manifest_path)
