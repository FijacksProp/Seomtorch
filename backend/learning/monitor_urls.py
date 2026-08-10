from django.urls import path
from . import monitor_views

app_name = "monitor"
urlpatterns = [
    path("login/", monitor_views.monitor_login, name="login"),
    path("logout/", monitor_views.monitor_logout, name="logout"),
    path("", monitor_views.dashboard, name="dashboard"),
    path("students/", monitor_views.students, name="students"),
    path("students/<str:public_id>/", monitor_views.student_detail, name="student-detail"),
    path("subjects/<slug:slug>/", monitor_views.subject_detail, name="subject-detail"),
]
