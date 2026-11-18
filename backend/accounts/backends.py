from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model


class EmailOrUsernameBackend(ModelBackend):
    """Keep Django's unique username auth while supporting portal-aware email login."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        email = kwargs.get("email")
        portal = kwargs.get("portal")

        if email is None and username and "@" in username:
            email = username
        if email is not None:
            accounts = User.objects.filter(email__iexact=email.strip())
            if portal:
                accounts = accounts.filter(user_type=portal)
            elif accounts.count() > 1:
                return None
            user = next((candidate for candidate in accounts if candidate.check_password(password)), None)
            if user and self.user_can_authenticate(user):
                return user
            return None

        return super().authenticate(request, username=username, password=password, **kwargs)
