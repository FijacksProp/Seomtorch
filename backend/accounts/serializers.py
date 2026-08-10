from django.contrib.auth import authenticate, password_validation
from rest_framework import serializers

from learning.models import UserStats
from .models import User

class UserSerializer(serializers.ModelSerializer):
    stats = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("public_id", "email", "username", "date_joined", "stats")

    def get_stats(self, user):
        stats, _ = UserStats.objects.get_or_create(user=user)
        return {"xp": stats.xp, "level": stats.level, "current_streak": stats.current_streak, "best_streak": stats.best_streak}

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)

    class Meta:
        model = User
        fields = ("email", "username", "password")

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(email=attrs["email"].lower().strip(), password=attrs["password"])
        if not user or not user.is_active:
            raise serializers.ValidationError("The email or password is incorrect.")
        attrs["user"] = user
        return attrs
