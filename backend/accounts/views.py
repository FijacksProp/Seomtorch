from django.contrib.auth import logout
from rest_framework import permissions, status, throttling
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from learning.models import ActivityEvent, UserStats
from .models import AspirantProfile, UniversityProfile, User
from .serializers import (
    AspirantProfileSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    RegisterSerializer,
    SwitchModeSerializer,
    UniversityProfileSerializer,
    UserSerializer,
)


class AuthThrottle(throttling.AnonRateThrottle):
    scope = "auth"


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        UserStats.objects.get_or_create(user=user)
        token = Token.objects.create(user=user)
        ActivityEvent.objects.create(user=user, event_type=ActivityEvent.Type.REGISTERED)
        return Response(
            {"token": token.key, "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        ActivityEvent.objects.create(user=user, event_type=ActivityEvent.Type.SIGNED_IN)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class LogoutView(APIView):
    def post(self, request):
        ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.SIGNED_OUT)
        # DRF's built-in token is shared by a user's signed-in devices. Keep it
        # valid here so signing out on one browser does not disconnect the rest.
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response({"user": UserSerializer(user).data})


class SwitchModeView(APIView):
    """Toggle the user's active mode between aspirant and university."""

    def post(self, request):
        serializer = SwitchModeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.active_mode = serializer.validated_data["mode"]
        user.save(update_fields=("active_mode",))
        return Response({"user": UserSerializer(user).data})


class AspirantProfileView(APIView):
    """Create or update the user's aspirant profile."""

    def get(self, request):
        if not request.user.has_aspirant_profile:
            return Response({"detail": "No aspirant profile found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AspirantProfileSerializer(request.user.aspirant_profile).data)

    def post(self, request):
        profile, created = AspirantProfile.objects.get_or_create(user=request.user)
        serializer = AspirantProfileSerializer(profile, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # If this is a fresh profile, set active_mode to aspirant
        if created:
            if not request.user.has_university_profile:
                request.user.active_mode = "aspirant"
                request.user.save(update_fields=("active_mode",))

        return Response(
            {"user": UserSerializer(request.user).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class UniversityProfileView(APIView):
    """Create or update the user's university profile."""

    def get(self, request):
        if not request.user.has_university_profile:
            return Response({"detail": "No university profile found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(UniversityProfileSerializer(request.user.university_profile).data)

    def post(self, request):
        profile, created = UniversityProfile.objects.get_or_create(user=request.user)
        serializer = UniversityProfileSerializer(profile, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # If this is a fresh profile, set active_mode to university
        if created:
            if not request.user.has_aspirant_profile:
                request.user.active_mode = "university"
                request.user.save(update_fields=("active_mode",))

        return Response(
            {"user": UserSerializer(request.user).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class UpdatePhoneView(APIView):
    def post(self, request):
        import re
        phone = (request.data.get("phone_number") or "").strip()
        if phone:
            # Basic validation: must start with + or digit, 7-20 chars, digits/spaces/dashes/plus only
            cleaned = re.sub(r"[\s\-]", "", phone)
            if not re.match(r"^\+?\d{7,15}$", cleaned):
                return Response({"detail": "Enter a valid phone number (e.g. +2348012345678)."}, status=status.HTTP_400_BAD_REQUEST)
            phone = cleaned
        request.user.phone_number = phone
        request.user.save(update_fields=("phone_number",))
        return Response({"user": UserSerializer(request.user).data})


class UpdateAvatarView(APIView):
    def post(self, request):
        update_fields = []
        if "avatar" in request.data:
            avatar = str(request.data.get("avatar") or "").strip()
            request.user.avatar = avatar
            update_fields.append("avatar")
        if "gender" in request.data:
            gender = str(request.data.get("gender") or "").strip().lower()
            if gender in ["male", "female", ""]:
                request.user.gender = gender
                update_fields.append("gender")
        if update_fields:
            request.user.save(update_fields=update_fields)
        return Response({"user": UserSerializer(request.user).data})


class ContactMatchView(APIView):
    def post(self, request):
        import re
        phones = request.data.get("phones", [])
        emails = request.data.get("emails", [])
        if not isinstance(phones, list) or not isinstance(emails, list):
            return Response({"detail": "phones and emails must be lists."}, status=status.HTTP_400_BAD_REQUEST)
        if len(phones) + len(emails) > 500:
            return Response({"detail": "Too many contacts submitted. Maximum 500."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Normalize phones: strip spaces/dashes, ensure we match
        cleaned_phones = []
        for p in phones:
            if isinstance(p, str):
                cleaned = re.sub(r"[\s\-]", "", p.strip())
                if cleaned:
                    cleaned_phones.append(cleaned)
                    # Also add Nigerian +234 variant if starts with 0
                    if cleaned.startswith("0") and len(cleaned) == 11:
                        cleaned_phones.append("+234" + cleaned[1:])
                    elif cleaned.startswith("234") and not cleaned.startswith("+"):
                        cleaned_phones.append("+" + cleaned)
        
        # Normalize emails
        cleaned_emails = [e.strip().lower() for e in emails if isinstance(e, str) and e.strip()]
        
        # Query matching users (exclude the requesting user)
        from django.db.models import Q
        query = Q()
        if cleaned_phones:
            query |= Q(phone_number__in=cleaned_phones)
        if cleaned_emails:
            query |= Q(email__in=cleaned_emails)
        
        if not query:
            return Response({"matches": []})
        
        matches = User.objects.filter(query, is_active=True).exclude(id=request.user.id)
        result = [
            {"public_id": u.public_id, "username": u.username}
            for u in matches
        ]
        return Response({"matches": result})

