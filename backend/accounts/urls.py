from django.urls import path
from .security_views import RequestEmailVerificationView, VerifyEmailCodeView, ResendEmailCodeView, AccountSecurityView
from .security_views import RequestEmailChangeView, ResendEmailChangeView, ConfirmEmailChangeView, CancelEmailChangeView
from .views import (
    AspirantProfileView,
    ChangePasswordView,
    ContactMatchView,
    LoginView,
    LogoutView,
    MeView,
    RegisterView,
    SwitchModeView,
    UniversityProfileView,
    UpdatePhoneView,
    UpdateAvatarView,
)

urlpatterns = [
    path("email/change/cancel/", CancelEmailChangeView.as_view(), name="email-change-cancel"),
    path("email/change/request/", RequestEmailChangeView.as_view(), name="email-change-request"),
    path("email/change/resend/", ResendEmailChangeView.as_view(), name="email-change-resend"),
    path("email/change/confirm/", ConfirmEmailChangeView.as_view(), name="email-change-confirm"),
    path("security/", AccountSecurityView.as_view(), name="account-security"),
    path("email/request/", RequestEmailVerificationView.as_view(), name="email-request"),
    path("email/verify/", VerifyEmailCodeView.as_view(), name="email-verify"),
    path("email/resend/", ResendEmailCodeView.as_view(), name="email-resend"),
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("switch-mode/", SwitchModeView.as_view(), name="switch-mode"),
    path("aspirant-profile/", AspirantProfileView.as_view(), name="aspirant-profile"),
    path("university-profile/", UniversityProfileView.as_view(), name="university-profile"),
    path("update-phone/", UpdatePhoneView.as_view(), name="update-phone"),
    path("update-avatar/", UpdateAvatarView.as_view(), name="update-avatar"),
    path("contacts/match/", ContactMatchView.as_view(), name="contacts-match"),
]
