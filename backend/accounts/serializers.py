from django.contrib.auth import authenticate, password_validation
from rest_framework import serializers

from learning.models import UserStats
from learning.analytics import user_test_analytics
from .models import AspirantProfile, UniversityProfile, User, UserType


# ── Profile Serializers ──────────────────────────────────────────────────────

class AspirantProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = AspirantProfile
        fields = ("exam_type", "target_year", "preferred_subjects")

    def validate_target_year(self, value):
        if value < 2020 or value > 2035:
            raise serializers.ValidationError("Target year must be between 2020 and 2035.")
        return value

    def validate_preferred_subjects(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list of subject slugs.")
        if len(value) > 9:
            raise serializers.ValidationError("You can select up to 9 subjects.")
        return value


class UniversityProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UniversityProfile
        fields = ("university_name", "faculty", "department", "level", "current_courses")
        extra_kwargs = {"faculty": {"required": False, "allow_blank": True}}

    def validate_university_name(self, value):
        if len(value.strip()) < 3:
            raise serializers.ValidationError("University name is too short.")
        return value.strip()

    def validate_current_courses(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list of course codes.")
        return value


# ── User Serializer ──────────────────────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    account_security = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()
    has_aspirant_profile = serializers.SerializerMethodField()
    has_university_profile = serializers.SerializerMethodField()
    aspirant_profile = serializers.SerializerMethodField()
    university_profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "public_id", "email", "username", "phone_number", "gender", "avatar", "date_joined",
            "must_change_password", "user_type", "active_mode", "is_staff",
            "has_aspirant_profile", "has_university_profile",
            "aspirant_profile", "university_profile", "stats", "account_security",
        )
        read_only_fields = ("is_staff",)

    def get_account_security(self, user):
        from .email_security import security_status
        return security_status(user)

    def get_stats(self, user):
        stats, _ = UserStats.objects.get_or_create(user=user)
        return {
            "xp": stats.xp,
            "level": stats.level,
            "current_streak": stats.live_current_streak,
            "best_streak": stats.best_streak,
            "last_study_date": stats.last_study_date,
            "tests": user_test_analytics(user),
        }

    def get_has_aspirant_profile(self, user):
        return user.has_aspirant_profile

    def get_has_university_profile(self, user):
        return user.has_university_profile

    def get_aspirant_profile(self, user):
        if user.has_aspirant_profile:
            return AspirantProfileSerializer(user.aspirant_profile).data
        return None

    def get_university_profile(self, user):
        if user.has_university_profile:
            return UniversityProfileSerializer(user.university_profile).data
        return None


# ── Auth Serializers ─────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)
    user_type = serializers.ChoiceField(
        choices=UserType.choices, default=UserType.ASPIRANT, required=False,
    )
    gender = serializers.CharField(required=False, default="", allow_blank=True)
    avatar = serializers.CharField(required=False, default="")

    class Meta:
        model = User
        fields = ("email", "username", "password", "user_type", "gender", "avatar")

    def validate_email(self, value):
        return value.lower().strip()

    def validate(self, attrs):
        account_type = attrs.get("user_type", UserType.ASPIRANT)
        if User.objects.filter(email__iexact=attrs["email"], user_type=account_type).exists():
            raise serializers.ValidationError({"email": "An account for this learning path already uses this email. Sign in instead."})
        return attrs

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        import random
        male_avatars = [
            "varsity-male",
            "scholar-male",
            "audio-male",
            "medic-male",
        ]
        female_avatars = [
            "varsity-female",
            "scholar-female",
            "audio-female",
            "medic-female",
            "hijab-female",
        ]
        all_avatars = male_avatars + female_avatars

        user_type = validated_data.pop("user_type", UserType.ASPIRANT)
        gender = (validated_data.pop("gender", "") or "").strip().lower()
        avatar = (validated_data.pop("avatar", "") or "").strip()

        if not avatar:
            if gender == "male":
                avatar = random.choice(male_avatars)
            elif gender == "female":
                avatar = random.choice(female_avatars)
            else:
                avatar = random.choice(all_avatars)

        # Set the path before the first insert. Creating with the default path
        # and updating afterward can violate the email/path unique constraint
        # for students who already have the other legacy path account.
        return User.objects.create_user(
            **validated_data,
            user_type=user_type,
            active_mode=user_type,
            gender=gender,
            avatar=avatar,
        )


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)
    portal = serializers.ChoiceField(choices=UserType.choices, required=False)

    def validate(self, attrs):
        email = attrs["email"].lower().strip()
        requested_portal = attrs.get("portal")
        all_accounts = User.objects.filter(email__iexact=email)
        if not requested_portal and all_accounts.count() > 1:
            raise serializers.ValidationError({"portal": "Choose the learning path for this account."})
        matching_accounts = [candidate for candidate in all_accounts if candidate.check_password(attrs["password"])]
        user = None
        if requested_portal:
            # Prefer a complete dual-profile account when legacy per-path
            # accounts with the same email are also present.
            user = next((candidate for candidate in matching_accounts if candidate.has_aspirant_profile and candidate.has_university_profile), None)
            if not user:
                user = next((candidate for candidate in matching_accounts if (
                    candidate.has_university_profile if requested_portal == UserType.UNIVERSITY
                    else candidate.has_aspirant_profile
                )), None)
            # Preserve the old per-path sign-in behavior if no saved profile
            # matches (for example, during initial account setup).
            if not user:
                user = next((candidate for candidate in matching_accounts if candidate.user_type == requested_portal), None)
        else:
            user = matching_accounts[0] if matching_accounts else None
        if not user and requested_portal:
            other = matching_accounts[0] if matching_accounts else None
            if other and other.is_active:
                portal_name = "university" if other.user_type == UserType.UNIVERSITY else "exam aspirant"
                raise serializers.ValidationError({"portal": f"This email and password belong to the {portal_name} path. Please use that sign-in page."})
        if not user or not user.is_active:
            raise serializers.ValidationError("The email or password is incorrect.")
        attrs["user"] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("The current password is incorrect.")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=("password", "must_change_password"))
        return user


class SwitchModeSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=UserType.choices)

    def validate_mode(self, value):
        user = self.context["request"].user
        if value == UserType.ASPIRANT and not user.has_aspirant_profile:
            raise serializers.ValidationError(
                "Complete your aspirant profile setup before switching to aspirant mode."
            )
        if value == UserType.UNIVERSITY and not user.has_university_profile:
            raise serializers.ValidationError(
                "Complete your university profile setup before switching to university mode."
            )
        return value
