from datetime import timedelta

from django.utils import timezone
from knox.auth import TokenAuthentication as KnoxTokenAuthentication
from rest_framework.authentication import BaseAuthentication, TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed


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
                return ExpiringLegacyTokenAuthentication().authenticate(request)
            except AuthenticationFailed:
                raise knox_error
        return authenticated

    def authenticate_header(self, request):
        return "Token"
