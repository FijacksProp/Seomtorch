from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase
from unittest.mock import patch

class AuthenticationTests(APITestCase):
    def test_register_returns_token_and_six_character_id(self):
        response = self.client.post("/api/auth/register/", {"email": "ada@example.com", "username": "ada", "password": "Securepass934!"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["user"]["public_id"]), 6)
        self.assertTrue(response.data["token"])
        self.assertEqual(get_user_model().objects.get().email, "ada@example.com")

    def test_sign_in_uses_email_not_username(self):
        get_user_model().objects.create_user(email="student@example.com", username="different-name", password="Securepass934!")
        response = self.client.post("/api/auth/login/", {"email": "student@example.com", "password": "Securepass934!"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["username"], "different-name")

    def test_duplicate_email_is_rejected_case_insensitively(self):
        get_user_model().objects.create_user(email="student@example.com", username="first", password="Securepass934!")
        response = self.client.post("/api/auth/register/", {"email": "STUDENT@example.com", "username": "second", "password": "Securepass934!"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_signing_out_one_device_keeps_shared_account_token_valid(self):
        user = get_user_model().objects.create_user(email="multi@example.com", username="multi", password="Securepass934!")
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, 204)
        self.assertTrue(Token.objects.filter(key=token.key).exists())

    def test_initial_superuser_password_can_only_reset_with_explicit_flag(self):
        user = get_user_model().objects.create_superuser(email="admin@example.com", username="admin", password="OldSecure934!")
        environment = {
            "DJANGO_SUPERUSER_EMAIL": "admin@example.com",
            "DJANGO_SUPERUSER_USERNAME": "admin",
            "DJANGO_SUPERUSER_PASSWORD": "NewSecure934!",
            "DJANGO_SUPERUSER_RESET_PASSWORD": "True",
        }
        with patch.dict("os.environ", environment, clear=False):
            call_command("create_initial_superuser", verbosity=0)
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewSecure934!"))

    def test_student_can_replace_a_temporary_password(self):
        user = get_user_model().objects.create_user(email="reset@example.com", username="reset", password="Temporary934!", must_change_password=True)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post("/api/auth/change-password/", {"current_password": "Temporary934!", "new_password": "Permanent934!Safe"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["user"]["must_change_password"])
        user.refresh_from_db()
        self.assertFalse(user.must_change_password)
        self.assertTrue(user.check_password("Permanent934!Safe"))

    def test_password_change_rejects_the_wrong_current_password(self):
        user = get_user_model().objects.create_user(email="secure@example.com", username="secure", password="Current934!Safe")
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post("/api/auth/change-password/", {"current_password": "Wrong934!", "new_password": "Replacement934!Safe"}, format="json")
        self.assertEqual(response.status_code, 400)
        user.refresh_from_db()
        self.assertTrue(user.check_password("Current934!Safe"))

    def test_temporary_password_account_cannot_use_learning_api_before_change(self):
        user = get_user_model().objects.create_user(email="blocked@example.com", username="blocked", password="Temporary934!", must_change_password=True)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get("/api/subjects/")
        self.assertEqual(response.status_code, 403)
        self.assertIn("temporary password", response.data["detail"])

    def test_register_male_gender_allocates_male_avatar(self):
        male_avatars = {"varsity-male", "scholar-male", "audio-male", "medic-male"}
        response = self.client.post("/api/auth/register/", {
            "email": "male.student@example.com",
            "username": "malestudent",
            "password": "Securepass934!",
            "gender": "male"
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["gender"], "male")
        self.assertIn(response.data["user"]["avatar"], male_avatars)

    def test_register_female_gender_allocates_female_avatar(self):
        female_avatars = {"varsity-female", "scholar-female", "audio-female", "medic-female", "hijab-female"}
        response = self.client.post("/api/auth/register/", {
            "email": "female.student@example.com",
            "username": "femalestudent",
            "password": "Securepass934!",
            "gender": "female"
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["gender"], "female")
        self.assertIn(response.data["user"]["avatar"], female_avatars)


class ContactTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="me@example.com", username="meuser", password="Securepass934!"
        )
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def test_update_phone_number(self):
        res = self.client.post("/api/auth/update-phone/", {"phone_number": "+234 801 234 5678"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["user"]["phone_number"], "+2348012345678")
        self.user.refresh_from_db()
        self.assertEqual(self.user.phone_number, "+2348012345678")

    def test_update_phone_number_invalid(self):
        res = self.client.post("/api/auth/update-phone/", {"phone_number": "not-a-phone"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_contact_match(self):
        other1 = get_user_model().objects.create_user(
            email="friend1@example.com", username="friend1", password="Securepass934!",
            phone_number="+2348011111111"
        )
        other2 = get_user_model().objects.create_user(
            email="friend2@example.com", username="friend2", password="Securepass934!",
            phone_number="+2348022222222"
        )
        res = self.client.post(
            "/api/auth/contacts/match/",
            {"phones": ["08011111111", "09999999999"], "emails": ["friend2@example.com", "nobody@example.com"]},
            format="json"
        )
        self.assertEqual(res.status_code, 200)
        matches = {m["public_id"]: m["username"] for m in res.data["matches"]}
        self.assertIn(other1.public_id, matches)
        self.assertIn(other2.public_id, matches)
        self.assertNotIn(self.user.public_id, matches)

    def test_contact_match_validation(self):
        res = self.client.post("/api/auth/contacts/match/", {"phones": "invalid"}, format="json")
        self.assertEqual(res.status_code, 400)
        res2 = self.client.post("/api/auth/contacts/match/", {"phones": ["1"] * 501, "emails": []}, format="json")
        self.assertEqual(res2.status_code, 400)


class CommunityTests(APITestCase):
    """Tests for the buddies/community follow system."""

    def setUp(self):
        User = get_user_model()
        self.alice = User.objects.create_user(
            email="alice@example.com", username="alice", password="Securepass934!"
        )
        self.bob = User.objects.create_user(
            email="bob@example.com", username="bob", password="Securepass934!"
        )
        self.carol = User.objects.create_user(
            email="carol@example.com", username="carol", password="Securepass934!"
        )
        self.alice_token = Token.objects.create(user=self.alice)
        self.bob_token = Token.objects.create(user=self.bob)
        # Give alice some XP
        from learning.models import UserStats
        UserStats.objects.filter(user=self.alice).update(xp=500)
        UserStats.objects.filter(user=self.bob).update(xp=300)
        UserStats.objects.filter(user=self.carol).update(xp=100)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    def test_follow_creates_relationship(self):
        self._auth(self.alice_token)
        res = self.client.post("/api/community/follow/", {"public_id": self.bob.public_id}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertFalse(res.data["is_mutual"])
        self.assertEqual(res.data["counts"]["following"], 1)

    def test_follow_self_is_rejected(self):
        self._auth(self.alice_token)
        res = self.client.post("/api/community/follow/", {"public_id": self.alice.public_id}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_mutual_follow_creates_buddies(self):
        from accounts.models import StudentFollow
        # Alice follows Bob
        StudentFollow.objects.create(follower=self.alice, following=self.bob)
        # Bob follows Alice
        self._auth(self.bob_token)
        res = self.client.post("/api/community/follow/", {"public_id": self.alice.public_id}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data["is_mutual"])

    def test_unfollow_removes_relationship(self):
        from accounts.models import StudentFollow
        StudentFollow.objects.create(follower=self.alice, following=self.bob)
        self._auth(self.alice_token)
        res = self.client.post("/api/community/unfollow/", {"public_id": self.bob.public_id}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["counts"]["following"], 0)

    def test_network_returns_counts_and_lists(self):
        from accounts.models import StudentFollow
        # Mutual follow
        StudentFollow.objects.create(follower=self.alice, following=self.bob)
        StudentFollow.objects.create(follower=self.bob, following=self.alice)
        # One-way: carol follows alice
        StudentFollow.objects.create(follower=self.carol, following=self.alice)

        self._auth(self.alice_token)
        res = self.client.get("/api/community/network/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["counts"]["buddies"], 1)
        self.assertEqual(res.data["counts"]["followers"], 2)  # bob + carol
        self.assertEqual(res.data["counts"]["following"], 1)  # bob

    def test_leaderboard_sorted_by_xp(self):
        from accounts.models import StudentFollow
        # Make alice and bob mutual buddies
        StudentFollow.objects.create(follower=self.alice, following=self.bob)
        StudentFollow.objects.create(follower=self.bob, following=self.alice)

        self._auth(self.alice_token)
        res = self.client.get("/api/community/leaderboard/")
        self.assertEqual(res.status_code, 200)
        board = res.data["leaderboard"]
        self.assertEqual(len(board), 2)  # alice + bob
        # Alice has 500 XP, Bob has 300 — alice should be first
        self.assertEqual(board[0]["public_id"], self.alice.public_id)
        self.assertTrue(board[0]["is_you"])
        self.assertEqual(board[0]["rank"], 1)
        self.assertEqual(board[1]["public_id"], self.bob.public_id)
        self.assertEqual(board[1]["rank"], 2)

    def test_search_by_public_id(self):
        self._auth(self.alice_token)
        res = self.client.get(f"/api/community/search/?q={self.bob.public_id}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["public_id"], self.bob.public_id)
        self.assertEqual(res.data["results"][0]["follow_state"], "none")

    def test_search_by_username(self):
        self._auth(self.alice_token)
        res = self.client.get("/api/community/search/?q=bo")
        self.assertEqual(res.status_code, 200)
        ids = [r["public_id"] for r in res.data["results"]]
        self.assertIn(self.bob.public_id, ids)

    def test_search_shows_follow_state(self):
        from accounts.models import StudentFollow
        StudentFollow.objects.create(follower=self.alice, following=self.bob)
        self._auth(self.alice_token)
        res = self.client.get(f"/api/community/search/?q={self.bob.public_id}")
        self.assertEqual(res.data["results"][0]["follow_state"], "following")

    def test_search_excludes_self(self):
        self._auth(self.alice_token)
        res = self.client.get(f"/api/community/search/?q={self.alice.public_id}")
        self.assertEqual(res.status_code, 200)
        ids = [r["public_id"] for r in res.data["results"]]
        self.assertNotIn(self.alice.public_id, ids)

    def test_search_query_too_short(self):
        self._auth(self.alice_token)
        res = self.client.get("/api/community/search/?q=a")
        self.assertEqual(res.status_code, 400)

    def test_duplicate_follow_is_idempotent(self):
        self._auth(self.alice_token)
        self.client.post("/api/community/follow/", {"public_id": self.bob.public_id}, format="json")
        res = self.client.post("/api/community/follow/", {"public_id": self.bob.public_id}, format="json")
        self.assertEqual(res.status_code, 200)  # Already following

    def test_follow_nonexistent_student(self):
        self._auth(self.alice_token)
        res = self.client.post("/api/community/follow/", {"public_id": "ZZZZZZ"}, format="json")
        self.assertEqual(res.status_code, 404)
