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
    stats = serializers.SerializerMethodField()
    has_aspirant_profile = serializers.SerializerMethodField()
    has_university_profile = serializers.SerializerMethodField()
    aspirant_profile = serializers.SerializerMethodField()
    university_profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "public_id", "email", "username", "date_joined",
            "must_change_password", "user_type", "active_mode",
            "has_aspirant_profile", "has_university_profile",
            "aspirant_profile", "university_profile", "stats",
        )

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

    class Meta:
        model = User
        fields = ("email", "username", "password", "user_type")

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        user_type = validated_data.pop("user_type", UserType.ASPIRANT)
        user = User.objects.create_user(**validated_data)
        user.user_type = user_type
        user.active_mode = user_type
        user.save(update_fields=("user_type", "active_mode"))
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(email=attrs["email"].lower().strip(), password=attrs["password"])
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
