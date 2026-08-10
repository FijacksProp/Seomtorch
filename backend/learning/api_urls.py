from django.urls import path
from .api_views import AttemptSyncView, BookmarkView, CompleteSessionView, ProgressView, StartSessionView, SubjectListView

urlpatterns = [
    path("subjects/", SubjectListView.as_view(), name="subjects"),
    path("sessions/", StartSessionView.as_view(), name="session-start"),
    path("sessions/<uuid:session_id>/complete/", CompleteSessionView.as_view(), name="session-complete"),
    path("attempts/", AttemptSyncView.as_view(), name="attempts"),
    path("progress/", ProgressView.as_view(), name="progress"),
    path("bookmarks/", BookmarkView.as_view(), name="bookmarks"),
]
