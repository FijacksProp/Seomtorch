"""Community API views — follow, unfollow, network, leaderboard, search."""

from django.contrib.auth import get_user_model
from django.db.models import Q, Exists, OuterRef, Subquery, Value, BooleanField
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import StudentFollow

User = get_user_model()


def _get_buddy_ids(user):
    """Return a set of user IDs that are mutual follows with the given user."""
    following_ids = set(
        StudentFollow.objects.filter(follower=user).values_list("following_id", flat=True)
    )
    follower_ids = set(
        StudentFollow.objects.filter(following=user).values_list("follower_id", flat=True)
    )
    return following_ids & follower_ids


def _user_card(user, stats=None, is_mutual=None):
    """Serialize a user into a compact card dict."""
    if stats is None:
        stats = getattr(user, "learning_stats", None)
    card = {
        "public_id": user.public_id,
        "username": user.username,
        "avatar": user.avatar or "",
        "gender": user.gender or "",
    }
    if stats:
        card.update({
            "xp": stats.xp,
            "level": stats.level,
            "streak": stats.live_current_streak,
        })
    else:
        card.update({"xp": 0, "level": 1, "streak": 0})
    if is_mutual is not None:
        card["is_mutual"] = is_mutual
    return card


class FollowView(APIView):
    """POST /api/community/follow/ — Follow another student by public_id."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        public_id = (request.data.get("public_id") or "").strip().upper()
        if not public_id:
            return Response({"detail": "public_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target = User.objects.get(public_id=public_id)
        except User.DoesNotExist:
            return Response({"detail": "Student not found."}, status=status.HTTP_404_NOT_FOUND)

        if target == request.user:
            return Response({"detail": "You cannot follow yourself."}, status=status.HTTP_400_BAD_REQUEST)

        _, created = StudentFollow.objects.get_or_create(follower=request.user, following=target)
        if not created:
            return Response({"detail": "Already following this student."}, status=status.HTTP_200_OK)

        # Check if now mutual
        is_mutual = StudentFollow.objects.filter(follower=target, following=request.user).exists()

        return Response({
            "detail": "Followed successfully.",
            "is_mutual": is_mutual,
            "counts": _counts_for(request.user),
        }, status=status.HTTP_201_CREATED)


class UnfollowView(APIView):
    """POST /api/community/unfollow/ — Unfollow a student by public_id."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        public_id = (request.data.get("public_id") or "").strip().upper()
        if not public_id:
            return Response({"detail": "public_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target = User.objects.get(public_id=public_id)
        except User.DoesNotExist:
            return Response({"detail": "Student not found."}, status=status.HTTP_404_NOT_FOUND)

        deleted, _ = StudentFollow.objects.filter(follower=request.user, following=target).delete()
        if not deleted:
            return Response({"detail": "You were not following this student."}, status=status.HTTP_200_OK)

        return Response({
            "detail": "Unfollowed successfully.",
            "counts": _counts_for(request.user),
        }, status=status.HTTP_200_OK)


class NetworkView(APIView):
    """GET /api/community/network/ — Return social graph: buddies, followers, following, counts."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        buddy_ids = _get_buddy_ids(user)

        # Buddies (mutual) — with stats
        buddy_users = User.objects.filter(id__in=buddy_ids).select_related("learning_stats")
        buddies = [_user_card(u, is_mutual=True) for u in buddy_users]

        # Followers
        follower_ids_qs = StudentFollow.objects.filter(following=user).values_list("follower_id", flat=True)
        follower_users = User.objects.filter(id__in=follower_ids_qs).select_related("learning_stats")
        followers = [_user_card(u, is_mutual=(u.id in buddy_ids)) for u in follower_users]

        # Following
        following_ids_qs = StudentFollow.objects.filter(follower=user).values_list("following_id", flat=True)
        following_users = User.objects.filter(id__in=following_ids_qs).select_related("learning_stats")
        following = [_user_card(u, is_mutual=(u.id in buddy_ids)) for u in following_users]

        return Response({
            "counts": {
                "followers": len(followers),
                "following": len(following),
                "buddies": len(buddies),
            },
            "buddies": sorted(buddies, key=lambda b: b["xp"], reverse=True),
            "followers": followers,
            "following": following,
        })


class LeaderboardView(APIView):
    """GET /api/community/leaderboard/ — Buddies leaderboard ranked by XP."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        buddy_ids = _get_buddy_ids(user)

        # Include self + buddies
        all_ids = buddy_ids | {user.id}
        users = User.objects.filter(id__in=all_ids).select_related("learning_stats")

        entries = []
        for u in users:
            stats = getattr(u, "learning_stats", None)
            entries.append({
                "public_id": u.public_id,
                "username": u.username,
                "avatar": u.avatar or "",
                "gender": u.gender or "",
                "xp": stats.xp if stats else 0,
                "level": stats.level if stats else 1,
                "streak": stats.live_current_streak if stats else 0,
                "is_you": u.id == user.id,
            })

        # Sort by XP descending, then username
        entries.sort(key=lambda e: (-e["xp"], e["username"]))

        # Add rank position
        for i, entry in enumerate(entries, 1):
            entry["rank"] = i

        return Response({"leaderboard": entries})


class SearchView(APIView):
    """GET /api/community/search/?q=... — Search students by public_id or username."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response(
                {"detail": "Search query must be at least 2 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Search by exact public_id (case-insensitive) or username contains
        results = User.objects.filter(
            Q(public_id__iexact=query) | Q(username__icontains=query)
        ).exclude(
            id=request.user.id
        ).exclude(
            is_staff=True
        ).select_related("learning_stats")[:20]

        # Determine follow state for each result
        following_ids = set(
            StudentFollow.objects.filter(follower=request.user).values_list("following_id", flat=True)
        )
        follower_ids = set(
            StudentFollow.objects.filter(following=request.user).values_list("follower_id", flat=True)
        )

        entries = []
        for u in results:
            i_follow = u.id in following_ids
            they_follow = u.id in follower_ids
            if i_follow and they_follow:
                follow_state = "mutual"
            elif i_follow:
                follow_state = "following"
            elif they_follow:
                follow_state = "followed_by"
            else:
                follow_state = "none"

            card = _user_card(u)
            card["follow_state"] = follow_state
            entries.append(card)

        return Response({"results": entries})


def _counts_for(user):
    """Return follower/following/buddy counts for a user."""
    following_count = StudentFollow.objects.filter(follower=user).count()
    follower_count = StudentFollow.objects.filter(following=user).count()
    buddy_count = len(_get_buddy_ids(user))
    return {
        "followers": follower_count,
        "following": following_count,
        "buddies": buddy_count,
    }
