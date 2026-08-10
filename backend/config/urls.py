from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from .views import health

admin.site.site_header = "Seomtorch Content Administration"
admin.site.site_title = "Seomtorch Admin"
admin.site.index_title = "Content and account management"

urlpatterns = [
    path("", RedirectView.as_view(pattern_name="monitor:dashboard", permanent=False)),
    path("api/health/", health, name="health"),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("learning.api_urls")),
    path("monitor/", include("learning.monitor_urls")),
    path("internal-admin/", admin.site.urls),
]
