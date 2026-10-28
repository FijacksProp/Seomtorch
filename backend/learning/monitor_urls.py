from django.urls import path
from . import monitor_views

app_name = "monitor"

urlpatterns = [
    # Auth
    path("login/", monitor_views.monitor_login, name="login"),
    path("logout/", monitor_views.monitor_logout, name="logout"),

    # Dashboard & Academic Overview
    path("", monitor_views.dashboard, name="dashboard"),

    # Student Directory & Detail
    path("students/", monitor_views.students, name="students"),
    path("students/<str:public_id>/", monitor_views.student_detail, name="student-detail"),
    path("students/<str:public_id>/reset-password/", monitor_views.reset_student_password, name="reset-student-password"),
    path("students/<str:public_id>/grant-access/", monitor_views.grant_student_access, name="grant-student-access"),
    path("students/<str:public_id>/revoke-access/", monitor_views.revoke_student_access, name="revoke-student-access"),

    # Subject Performance & Export
    path("subjects/<slug:slug>/", monitor_views.subject_detail, name="subject-detail"),
    path("export/csv/", monitor_views.export_students_csv, name="export-csv"),

    # Moderation Flags
    path("flags/", monitor_views.question_flags, name="flags"),
    path("flags/<uuid:report_id>/resolve/", monitor_views.resolve_flag, name="resolve-flag"),

    # Monetization & Site Controls Hub
    path("monetization/", monitor_views.monetization_hub, name="monetization"),
    path("monetization/update-pricing/", monitor_views.update_pricing, name="update-pricing"),
    path("monetization/create-discount/", monitor_views.create_discount_code, name="create-discount"),
    path("monetization/toggle-discount/<int:discount_id>/", monitor_views.toggle_discount_code, name="toggle-discount"),
    path("monetization/delete-discount/<int:discount_id>/", monitor_views.delete_discount_code, name="delete-discount"),
    path("monetization/grant-access/", monitor_views.quick_grant_access, name="quick-grant-access"),
    path("monetization/revoke-access/<int:access_id>/", monitor_views.quick_revoke_access, name="quick-revoke-access"),
    path("monetization/verify-transaction/<str:reference>/", monitor_views.verify_transaction_manual, name="verify-transaction"),
    path("monetization/update-free-topics/", monitor_views.update_free_topics, name="update-free-topics"),

    # Question Bank Management & Add Question
    path("questions/", monitor_views.questions_list, name="questions"),
    path("questions/add/", monitor_views.add_question, name="add-question"),
]
