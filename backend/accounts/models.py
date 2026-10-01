import secrets
import string

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models

PUBLIC_ID_ALPHABET = string.ascii_uppercase + string.digits

def generate_public_id():
    return "".join(secrets.choice(PUBLIC_ID_ALPHABET) for _ in range(6))

class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("An email address is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not extra_fields.get("is_staff") or not extra_fields.get("is_superuser"):
            raise ValueError("A superuser must have staff and superuser permissions")
        return self._create_user(email, password, **extra_fields)


class UserType(models.TextChoices):
    ASPIRANT = "aspirant", "Aspirant"
    UNIVERSITY = "university", "University"


class User(AbstractUser):
    email = models.EmailField(unique=True)
    public_id = models.CharField(max_length=6, unique=True, default=generate_public_id, editable=False, db_index=True)
    must_change_password = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    # ── Segmentation ──────────────────────────────────────
    user_type = models.CharField(
        max_length=12,
        choices=UserType.choices,
        default=UserType.ASPIRANT,
        help_text="The mode the user registered as first.",
    )
    active_mode = models.CharField(
        max_length=12,
        choices=UserType.choices,
        default=UserType.ASPIRANT,
        help_text="The mode the user is currently using.",
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]
    objects = UserManager()

    def save(self, *args, **kwargs):
        self.email = self.email.lower().strip()
        super().save(*args, **kwargs)

    @property
    def has_aspirant_profile(self):
        return hasattr(self, "aspirant_profile")

    @property
    def has_university_profile(self):
        return hasattr(self, "university_profile")

    def __str__(self):
        return f"{self.username} ({self.public_id})"


class ExamType(models.TextChoices):
    JAMB = "jamb", "JAMB UTME"
    WAEC = "waec", "WAEC SSCE"
    NECO = "neco", "NECO SSCE"
    POST_UTME = "post_utme", "POST-UTME"


class AspirantProfile(models.Model):
    """Profile details for aspirant/exam-prep students."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="aspirant_profile")
    exam_type = models.CharField(max_length=12, choices=ExamType.choices, default=ExamType.JAMB)
    target_year = models.PositiveIntegerField(default=2026)
    preferred_subjects = models.JSONField(
        default=list, blank=True,
        help_text="List of subject slugs the student is preparing for.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Aspirant Profile"
        verbose_name_plural = "Aspirant Profiles"

    def __str__(self):
        return f"{self.user.username} – {self.get_exam_type_display()} {self.target_year}"


class UniversityLevel(models.IntegerChoices):
    L100 = 100, "100 Level"
    L200 = 200, "200 Level"
    L300 = 300, "300 Level"
    L400 = 400, "400 Level"
    L500 = 500, "500 Level"
    L600 = 600, "600 Level"


class UniversityProfile(models.Model):
    """Profile details for university/undergraduate students."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="university_profile")
    university_name = models.CharField(max_length=200)
    faculty = models.CharField(max_length=200)
    department = models.CharField(max_length=200)
    level = models.PositiveIntegerField(choices=UniversityLevel.choices, default=UniversityLevel.L100)
    current_courses = models.JSONField(
        default=list, blank=True,
        help_text="List of course codes the student is currently offering.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "University Profile"
        verbose_name_plural = "University Profiles"

    def __str__(self):
        return f"{self.user.username} – {self.university_name} ({self.level}L)"
