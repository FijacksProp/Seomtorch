from django.urls import path
from . import monitor_views

app_name = "monitor"
urlpatterns = [
    path("login/", monitor_views.monitor_login, name="login"),
    path("logout/", monitor_views.monitor_logout, name="logout"),
    path("", monitor_views.dashboard, name="dashboard"),
    path("students/", monitor_views.students, name="students"),
    path("students/<str:public_id>/", monitor_views.student_detail, name="student-detail"),
    path("students/<str:public_id>/reset-password/", monitor_views.reset_student_password, name="reset-student-password"),
    path("subjects/<slug:slug>/", monitor_views.subject_detail, name="subject-detail"),
    path("export/csv/", monitor_views.export_students_csv, name="export-csv"),
    path("flags/", monitor_views.question_flags, name="flags"),
    path("flags/<uuid:report_id>/resolve/", monitor_views.resolve_flag, name="resolve-flag"),
]
