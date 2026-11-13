from django.urls import path

from . import partner_views

app_name = "partner"

urlpatterns = [
    path("login/", partner_views.partner_login, name="login"),
    path("logout/", partner_views.partner_logout, name="logout"),
    path("", partner_views.partner_dashboard, name="dashboard"),
]
