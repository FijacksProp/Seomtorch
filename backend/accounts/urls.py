from django.urls import path
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
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("switch-mode/", SwitchModeView.as_view(), name="switch-mode"),
    path("aspirant-profile/", AspirantProfileView.as_view(), name="aspirant-profile"),
    path("university-profile/", UniversityProfileView.as_view(), name="university-profile"),
    path("update-phone/", UpdatePhoneView.as_view(), name="update-phone"),
    path("contacts/match/", ContactMatchView.as_view(), name="contacts-match"),
]
