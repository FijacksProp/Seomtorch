from django.urls import path
from .api_views import AchievementView, AttemptSyncView, BookmarkView, CompleteSessionView, ProgressView, StartSessionView, SubjectListView, QuestionCommentView, QuestionReportView, DailySprintView
from .challenge_views import ChallengeDetailView, ChallengeListCreateView, ChallengeRespondView, ChallengeStartView, StudentLookupView

urlpatterns = [
    path("subjects/", SubjectListView.as_view(), name="subjects"),
    path("sessions/", StartSessionView.as_view(), name="session-start"),
    path("sessions/<uuid:session_id>/complete/", CompleteSessionView.as_view(), name="session-complete"),
    path("attempts/", AttemptSyncView.as_view(), name="attempts"),
    path("progress/", ProgressView.as_view(), name="progress"),
    path("bookmarks/", BookmarkView.as_view(), name="bookmarks"),
    path("questions/<str:question_id>/comments/", QuestionCommentView.as_view(), name="question-comments"),
    path("questions/<str:question_id>/report/", QuestionReportView.as_view(), name="question-report"),
    path("daily-sprint/", DailySprintView.as_view(), name="daily-sprint"),
    path("achievements/", AchievementView.as_view(), name="achievements"),
    path("students/lookup/", StudentLookupView.as_view(), name="student-lookup"),
    path("challenges/", ChallengeListCreateView.as_view(), name="challenges"),
    path("challenges/<uuid:challenge_id>/", ChallengeDetailView.as_view(), name="challenge-detail"),
    path("challenges/<uuid:challenge_id>/respond/", ChallengeRespondView.as_view(), name="challenge-respond"),
    path("challenges/<uuid:challenge_id>/start/", ChallengeStartView.as_view(), name="challenge-start"),
]
