from django.urls import path
from . import monitor_views
from accounts.feedback_monitor import feedback_inbox, update_feedback
from accounts.security_monitor import account_security_settings

app_name = "monitor"

urlpatterns = [
    path("account-security/", account_security_settings, name="account-security"),
    # Auth
    path("login/", monitor_views.monitor_login, name="login"),
    path("logout/", monitor_views.monitor_logout, name="logout"),

    # Dashboard & Academic Overview
    path("", monitor_views.dashboard, name="dashboard"),
    path("university/", monitor_views.university_dashboard, name="university"),

    # Student Directory & Detail
    path("students/", monitor_views.students, name="students"),
    path("students/<str:public_id>/", monitor_views.student_detail, name="student-detail"),
    path("students/<str:public_id>/reset-password/", monitor_views.reset_student_password, name="reset-student-password"),
    path("students/<str:public_id>/revoke-access/", monitor_views.revoke_student_access, name="revoke-student-access"),
    path("students/<str:public_id>/grant-access/", monitor_views.grant_student_access, name="grant-student-access"),

    # Subject Performance & Export
    path("subjects/<slug:slug>/", monitor_views.subject_detail, name="subject-detail"),
    path("export/csv/", monitor_views.export_students_csv, name="export-csv"),

    # Moderation Flags
    path("flags/", monitor_views.question_flags, name="flags"),
    path("feedback/", feedback_inbox, name="feedback"),
    path("feedback/<uuid:feedback_id>/", update_feedback, name="feedback-update"),
    path("flags/<uuid:report_id>/resolve/", monitor_views.resolve_flag, name="resolve-flag"),

    # Monetization & Site Controls Hub
    path("monetization/", monitor_views.monetization_hub, name="monetization"),
    path("account-security/content-shield/", monitor_views.toggle_screenshot_protection, name="toggle-screenshot-protection"),
    # Keep old admin links safe during a rolling deployment.
    path("monetization/toggle-screenshot-protection/", monitor_views.toggle_screenshot_protection),
    path("monetization/update-pricing/", monitor_views.update_pricing, name="update-pricing"),
    path("monetization/revoke-access/<int:access_id>/", monitor_views.quick_revoke_access, name="quick-revoke-access"),
    path("monetization/verify-transaction/<str:reference>/", monitor_views.verify_transaction_manual, name="verify-transaction"),
    path("monetization/discount-codes/create/", monitor_views.create_discount_code, name="create-discount-code"),
    path("monetization/discount-codes/<int:code_id>/toggle/", monitor_views.toggle_discount_code, name="toggle-discount-code"),
    path("partners/", monitor_views.partners_hub, name="partners"),
    path("partners/create/", monitor_views.create_partner_organization, name="create-partner"),
    path("partners/assign-admin/", monitor_views.assign_partner_admin, name="assign-partner-admin"),
    path("partners/students/<int:membership_id>/reassign/", monitor_views.reassign_partner_student, name="reassign-partner-student"),

    # Question Bank Management & Add Question
    path("questions/", monitor_views.questions_list, name="questions"),
    path("questions/add/", monitor_views.add_question, name="add-question"),
]
