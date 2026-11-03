from django.urls import path
from .community_views import (
    FollowView,
    LeaderboardView,
    NetworkView,
    SearchView,
    UnfollowView,
)
from .social_views import BuddyBlocksView, BuddyInboxView, BuddyMessagesView, BuddyUnblockView, FeedbackView, MessageReportView

urlpatterns = [
    path("follow/", FollowView.as_view(), name="community-follow"),
    path("unfollow/", UnfollowView.as_view(), name="community-unfollow"),
    path("network/", NetworkView.as_view(), name="community-network"),
    path("leaderboard/", LeaderboardView.as_view(), name="community-leaderboard"),
    path("search/", SearchView.as_view(), name="community-search"),
    path("feedback/", FeedbackView.as_view(), name="student-feedback"),
    path("inbox/", BuddyInboxView.as_view(), name="buddy-inbox"),
    path("messages/<str:public_id>/", BuddyMessagesView.as_view(), name="buddy-messages"),
    path("message-reports/<int:message_id>/", MessageReportView.as_view(), name="buddy-message-report"),
    path("blocks/", BuddyBlocksView.as_view(), name="buddy-blocks"),
    path("blocks/<str:public_id>/", BuddyUnblockView.as_view(), name="buddy-unblock"),
]
