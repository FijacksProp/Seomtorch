from rest_framework.permissions import BasePermission


class AccountReadyPermission(BasePermission):
    message = "Change the temporary password before continuing."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if not user.must_change_password:
            return True
        return request.resolver_match and request.resolver_match.url_name in {"change-password", "logout", "me"}
