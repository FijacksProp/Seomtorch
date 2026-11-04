from datetime import timedelta

from django.utils import timezone
from knox.auth import TokenAuthentication as KnoxTokenAuthentication
from rest_framework.authentication import BaseAuthentication, TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.exceptions import PermissionDenied


class ExpiringLegacyTokenAuthentication(TokenAuthentication):
    """Accept existing DRF tokens during migration, but never indefinitely."""

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if token.created < timezone.now() - timedelta(days=30):
            token.delete()
            raise AuthenticationFailed("Your saved sign-in has expired. Please sign in again.")
        return user, token


class MultiTokenAuthentication(BaseAuthentication):
    """Use per-device Knox tokens, while briefly accepting recent legacy tokens."""

    def authenticate(self, request):
        try:
            authenticated = KnoxTokenAuthentication().authenticate(request)
        except AuthenticationFailed as knox_error:
            try:
                authenticated = ExpiringLegacyTokenAuthentication().authenticate(request)
            except AuthenticationFailed:
                raise knox_error
        if authenticated:
            from accounts.email_security import security_status
            if security_status(authenticated[0])["verification_required"] and request.path.rstrip("/") not in {
                "/api/auth/me", "/api/auth/logout", "/api/auth/email/request", "/api/auth/change-password", "/api/auth/security",
                "/api/auth/email/change/request", "/api/auth/email/change/resend", "/api/auth/email/change/confirm",
                "/api/auth/email/change/cancel",
            }:
                raise PermissionDenied({"detail": "Verify your email to continue. Your progress and subscription are safe.", "code": "email_verification_required"})
        return authenticated

    def authenticate_header(self, request):
        return "Token"
