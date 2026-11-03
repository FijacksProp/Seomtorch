import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from .models import BuddyMessage, StudentBlock, StudentFeedback, StudentFollow

User = get_user_model()


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class StudentSocialTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.alice = User.objects.create_user(email="circle-alice@example.com", username="circle-alice", password="TestOnlyPass123!")
        cls.bob = User.objects.create_user(email="circle-bob@example.com", username="circle-bob", password="TestOnlyPass123!")
        cls.other = User.objects.create_user(email="circle-other@example.com", username="circle-other", password="TestOnlyPass123!")
        cls.staff = User.objects.create_user(email="circle-admin@example.com", username="circle-admin", password="TestOnlyPass123!", is_staff=True)
        StudentFollow.objects.create(follower=cls.alice, following=cls.bob)
        StudentFollow.objects.create(follower=cls.bob, following=cls.alice)

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.alice)

    def _send(self, peer=None, **extra):
        return self.client.post(f"/api/community/messages/{(peer or self.bob).public_id}/", {
            "body": "What topic are you revising today?", "client_id": str(uuid.uuid4()), **extra,
        }, format="json")

    def _feedback(self, **extra):
        return self.client.post("/api/community/feedback/", {
            "body": "Please improve the notebook search.", "category": "improvement",
            "client_id": str(uuid.uuid4()), **extra,
        }, format="json")

    def test_feedback_is_private_and_cannot_spoof_ownership_or_status(self):
        result = self._feedback(user=self.bob.id, status="done", admin_note="Spoof")
        self.assertEqual(result.status_code, 201, result.data)
        item = StudentFeedback.objects.get(id=result.data["id"])
        self.assertEqual(item.user_id, self.alice.id)
        self.assertEqual(item.status, "new")
        item.admin_note = "Internal discussion"
        item.save()
        own = self.client.get("/api/community/feedback/")
        self.assertEqual(len(own.data["feedback"]), 1)
        self.assertNotIn("admin_note", own.data["feedback"][0])
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.get("/api/community/feedback/").data["feedback"], [])

    def test_feedback_retries_are_idempotent_and_conflicts_are_rejected(self):
        client_id = str(uuid.uuid4())
        first = self._feedback(client_id=client_id)
        retry = self._feedback(client_id=client_id)
        self.assertEqual((first.status_code, retry.status_code), (201, 200))
        self.assertEqual(StudentFeedback.objects.count(), 1)
        conflict = self._feedback(client_id=client_id, body="Different feedback body")
        self.assertEqual(conflict.status_code, 409)

    def test_feedback_validation_and_anonymous_access(self):
        for body, category in [("  ", "general"), ("x" * 4001, "general"), ("A valid comment", "safety")]:
            with self.subTest(category=category, length=len(body)):
                self.assertEqual(self._feedback(body=body, category=category).status_code, 400)
        self.client.force_authenticate(None)
        self.assertIn(self._feedback().status_code, (401, 403))

    def test_students_cannot_open_the_admin_feedback_inbox(self):
        self.client.force_authenticate(None)
        self.client.force_login(self.alice)
        response = self.client.get("/monitor/feedback/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/monitor/login/", response.url)

    def test_staff_can_filter_review_feedback_without_exposing_html(self):
        item = StudentFeedback.objects.create(user=self.alice, category="bug", body='<script>alert("unsafe")</script>')
        self.client.force_authenticate(None)
        self.client.force_login(self.staff)
        response = self.client.get("/monitor/feedback/?category=bug")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "&lt;script&gt;")
        self.assertNotContains(response, '<script>alert("unsafe")</script>')
        saved = self.client.post(f"/monitor/feedback/{item.id}/", {"status": "reviewing", "admin_note": "Investigate on mobile"})
        self.assertEqual(saved.status_code, 302)
        item.refresh_from_db()
        self.assertEqual(item.status, "reviewing")
        self.assertEqual(item.admin_note, "Investigate on mobile")
        invalid = self.client.post(f"/monitor/feedback/{item.id}/", {"status": "invalid"})
        self.assertEqual(invalid.status_code, 302)
        item.refresh_from_db()
        self.assertEqual(item.status, "reviewing")

    def test_mutual_buddies_can_chat_but_not_strangers_or_one_way_follows(self):
        response = self._send()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self._send(self.other).status_code, 403)
        StudentFollow.objects.filter(follower=self.bob, following=self.alice).delete()
        self.assertEqual(self._send().status_code, 403)
        self.assertEqual(self.client.get(f"/api/community/messages/{self.bob.public_id}/").status_code, 403)

    def test_message_retries_do_not_duplicate_and_sender_is_server_owned(self):
        client_id = str(uuid.uuid4())
        first = self._send(client_id=client_id, sender=self.bob.id)
        second = self._send(client_id=client_id)
        self.assertEqual((first.status_code, second.status_code), (201, 200))
        self.assertEqual(BuddyMessage.objects.count(), 1)
        self.assertEqual(BuddyMessage.objects.get().sender_id, self.alice.id)
        self.assertEqual(self._send(client_id=client_id, body="Different message").status_code, 409)

    def test_message_validation(self):
        for body in ("", "  ", "a" * 2001):
            self.assertEqual(self._send(body=body).status_code, 400)
        self.assertEqual(self._send(body="A useful note.\nΚαλή μελέτη!").status_code, 201)

    def test_private_conversations_do_not_leak_to_inbox_or_other_users(self):
        message = BuddyMessage.objects.create(sender=self.bob, recipient=self.alice, body="Private revision note")
        BuddyMessage.objects.create(sender=self.bob, recipient=self.other, body="A different private note")
        inbox = self.client.get("/api/community/inbox/")
        self.assertEqual(inbox.status_code, 200, inbox.data)
        self.assertEqual(len(inbox.data["conversations"]), 1)
        self.assertEqual(inbox.data["conversations"][0]["preview"], message.body)
        self.assertEqual(inbox.data["unread"], 1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/community/messages/{self.alice.public_id}/").status_code, 403)
        self.assertEqual(self.client.get("/api/community/inbox/").data["conversations"], [])
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(f"/api/community/messages/{self.alice.public_id}/").status_code, 403)

    def test_history_download_does_not_mark_seen_until_explicit_acknowledgement(self):
        messages = BuddyMessage.objects.bulk_create([
            BuddyMessage(sender=self.bob, recipient=self.alice, body=f"Revision note {index}")
            for index in range(45)
        ])
        initial = self.client.get(f"/api/community/messages/{self.bob.public_id}/")
        self.assertEqual(initial.status_code, 200, initial.data)
        self.assertEqual(len(initial.data["messages"]), 40)
        self.assertTrue(initial.data["has_more"])
        self.assertEqual([item["id"] for item in initial.data["messages"]], [item.id for item in messages[5:]])
        self.assertEqual(BuddyMessage.objects.filter(recipient=self.alice, read_at__isnull=True).count(), 45)
        ack = self.client.post(f"/api/community/messages/{self.bob.public_id}/read/", {
            "message_ids": [item["id"] for item in initial.data["messages"]],
        }, format="json")
        self.assertEqual(ack.status_code, 200, ack.data)
        self.assertEqual(BuddyMessage.objects.filter(recipient=self.alice, read_at__isnull=True).count(), 5)
        older = self.client.get(f"/api/community/messages/{self.bob.public_id}/", {"before": initial.data["next_before"]})
        self.assertEqual(len(older.data["messages"]), 5)
        self.assertFalse(older.data["has_more"])
        latest = BuddyMessage.objects.create(sender=self.bob, recipient=self.alice, body="One more thing")
        polled = self.client.get(f"/api/community/messages/{self.bob.public_id}/", {"after": messages[-1].id})
        self.assertEqual([item["id"] for item in polled.data["messages"]], [latest.id])
        self.assertEqual(self.client.get("/api/community/inbox/").data["unread"], 6)
        ack = self.client.post(f"/api/community/messages/{self.bob.public_id}/read/", {
            "message_ids": [item.id for item in messages[:5]] + [latest.id],
        }, format="json")
        self.assertEqual(ack.status_code, 200, ack.data)
        self.assertEqual(self.client.get("/api/community/inbox/").data["unread"], 0)

    def test_seen_receipts_are_idempotent_and_arrive_after_message_cursor(self):
        sent = BuddyMessage.objects.create(sender=self.alice, recipient=self.bob, body="See you at revision")
        later = BuddyMessage.objects.create(sender=self.bob, recipient=self.alice, body="Ready!")
        url = f"/api/community/messages/{self.bob.public_id}/"
        pending = self.client.get(url, {"after": later.id, "receipt_ids": str(sent.id)})
        self.assertEqual(pending.data["receipts"], [])
        self.client.force_authenticate(self.bob)
        read_url = f"/api/community/messages/{self.alice.public_id}/read/"
        first = self.client.post(read_url, {"message_ids": [sent.id]}, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        sent.refresh_from_db()
        seen_at = sent.read_at
        self.assertIsNotNone(seen_at)
        again = self.client.post(read_url, {"message_ids": [sent.id, sent.id]}, format="json")
        self.assertEqual(again.status_code, 200, again.data)
        sent.refresh_from_db()
        self.assertEqual(sent.read_at, seen_at)
        self.client.force_authenticate(self.alice)
        response = self.client.get(url, {"after": later.id, "receipt_ids": f"{sent.id},{later.id}"})
        self.assertEqual(response.data["messages"], [])
        self.assertEqual([item["id"] for item in response.data["receipts"]], [sent.id])
        self.assertIsNotNone(response.data["receipts"][0]["read_at"])
        self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_seen_ack_cannot_mark_outgoing_or_another_conversation(self):
        received = BuddyMessage.objects.create(sender=self.bob, recipient=self.alice, body="Visible")
        outgoing = BuddyMessage.objects.create(sender=self.alice, recipient=self.bob, body="Not mine to read")
        private = BuddyMessage.objects.create(sender=self.bob, recipient=self.other, body="Another conversation")
        url = f"/api/community/messages/{self.bob.public_id}/read/"
        for invalid in (outgoing.id, private.id, 9223372036854775807):
            response = self.client.post(url, {"message_ids": [received.id, invalid]}, format="json")
            self.assertEqual(response.status_code, 400, response.data)
            received.refresh_from_db()
            self.assertIsNone(received.read_at, "Mixed invalid batches must be all-or-nothing")
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(url, {"message_ids": [private.id]}, format="json").status_code, 403)
        self.client.force_authenticate(self.alice)
        StudentBlock.objects.create(blocker=self.bob, blocked=self.alice)
        self.assertEqual(self.client.post(url, {"message_ids": [received.id]}, format="json").status_code, 403)

    def test_seen_validation_and_receipt_queries_are_bounded(self):
        url = f"/api/community/messages/{self.bob.public_id}/"
        for payload in ({}, {"message_ids": []}, {"message_ids": [0]}, {"message_ids": ["bad"]},
                        {"message_ids": list(range(1, 102))}, {"message_ids": [2**64]}, ["not an object"]):
            self.assertEqual(self.client.post(url + "read/", payload, format="json").status_code, 400)
        for ids in ("bad", "0", "-1", "1,,2", str(2**64), ",".join(["1"] * 101)):
            self.assertEqual(self.client.get(url, {"receipt_ids": ids}).status_code, 400)

    def test_seen_receipts_do_not_leak_between_buddies(self):
        from django.utils import timezone
        private = BuddyMessage.objects.create(sender=self.alice, recipient=self.other, body="Private", read_at=timezone.now())
        response = self.client.get(f"/api/community/messages/{self.bob.public_id}/", {"receipt_ids": str(private.id)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["receipts"], [])

    def test_message_cursors_are_validated(self):
        for cursor in ({"before": "-1"}, {"after": "bad"}, {"after": "9" * 40}, {"before": "1", "after": "2"}):
            self.assertEqual(self.client.get(f"/api/community/messages/{self.bob.public_id}/", cursor).status_code, 400)

    def test_blocking_stops_chat_both_ways_and_removes_discovery(self):
        self._send()
        blocked = self.client.post("/api/community/blocks/", {"public_id": self.bob.public_id}, format="json")
        self.assertEqual(blocked.status_code, 200, blocked.data)
        self.assertEqual(self._send().status_code, 403)
        self.assertEqual(self.client.get("/api/community/inbox/").data["conversations"], [])
        self.assertEqual(self.client.get("/api/community/search/", {"q": self.bob.public_id}).data["results"], [])
        self.assertEqual(StudentFollow.objects.filter(follower=self.alice, following=self.bob).count(), 0)
        self.client.force_authenticate(self.bob)
        self.assertEqual(self._send(self.alice).status_code, 403)
        self.assertEqual(self.client.post("/api/community/follow/", {"public_id": self.alice.public_id}, format="json").status_code, 403)
        self.assertEqual(self.client.get("/api/community/blocks/").data["blocked"], [])
        self.client.delete(f"/api/community/blocks/{self.alice.public_id}/")
        self.assertTrue(StudentBlock.objects.filter(blocker=self.alice, blocked=self.bob).exists())

    def test_unblocking_is_owner_only_and_does_not_restore_follows(self):
        StudentBlock.objects.create(blocker=self.alice, blocked=self.other)
        self.assertEqual(self.client.delete(f"/api/community/blocks/{self.other.public_id}/").status_code, 204)
        self.assertFalse(StudentBlock.objects.filter(blocker=self.alice, blocked=self.other).exists())
        self.assertFalse(StudentFollow.objects.filter(follower=self.alice, following=self.other).exists())
        self.assertEqual(self._send(self.other).status_code, 403)

    def test_only_recipients_can_report_and_report_snapshot_is_private(self):
        message = BuddyMessage.objects.create(sender=self.bob, recipient=self.alice, body="A message that should be reviewed")
        url = f"/api/community/message-reports/{message.id}/"
        first = self.client.post(url, {"reason": "This message made me uncomfortable"}, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(self.client.post(url, {"reason": "Please review it"}, format="json").status_code, 200)
        report = StudentFeedback.objects.get(reported_message=message)
        self.assertEqual(report.category, "safety")
        self.assertIn(message.body, report.body)
        self.assertEqual(self.client.get("/api/community/feedback/").data["feedback"], [])
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(url, {"reason": "I should not see this"}, format="json").status_code, 404)
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.post(url, {"reason": "My own message"}, format="json").status_code, 404)

    def test_message_write_throttle_does_not_limit_history_reads(self):
        with patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"buddy_messages": "1/minute"}):
            self.assertEqual(self._send().status_code, 201)
            self.assertEqual(self._send().status_code, 429)
            for _ in range(3):
                self.assertEqual(self.client.get(f"/api/community/messages/{self.bob.public_id}/").status_code, 200)

    def test_private_endpoints_are_not_cacheable(self):
        for url in ("/api/community/inbox/", "/api/community/feedback/", f"/api/community/messages/{self.bob.public_id}/"):
            self.assertEqual(self.client.get(url)["Cache-Control"], "private, no-store")

    def test_malformed_safety_requests_return_validation_errors(self):
        message = BuddyMessage.objects.create(sender=self.bob, recipient=self.alice, body="A reported message")
        for url in ("/api/community/blocks/", f"/api/community/message-reports/{message.id}/"):
            response = self.client.post(url, ["not", "an", "object"], format="json")
            self.assertEqual(response.status_code, 400, response.data)

    def test_accounts_requiring_password_change_cannot_use_private_social_features(self):
        self.alice.must_change_password = True
        self.alice.save(update_fields=("must_change_password",))
        self.assertEqual(self._feedback().status_code, 403)
        self.assertEqual(self._send().status_code, 403)
