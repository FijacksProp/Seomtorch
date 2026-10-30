from django.urls import path
from .community_views import (
    FollowView,
    LeaderboardView,
    NetworkView,
    SearchView,
    UnfollowView,
)

urlpatterns = [
    path("follow/", FollowView.as_view(), name="community-follow"),
    path("unfollow/", UnfollowView.as_view(), name="community-unfollow"),
    path("network/", NetworkView.as_view(), name="community-network"),
    path("leaderboard/", LeaderboardView.as_view(), name="community-leaderboard"),
    path("search/", SearchView.as_view(), name="community-search"),
]
