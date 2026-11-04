import secrets
import string
import uuid

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


class Gender(models.TextChoices):
    MALE = "male", "Male"
    FEMALE = "female", "Female"


class User(AbstractUser):
    email = models.EmailField(unique=True)
    email_verified_at = models.DateTimeField(null=True, blank=True, editable=False)
    trusted_browser_hash = models.CharField(max_length=64, blank=True, editable=False)
    public_id = models.CharField(max_length=6, unique=True, default=generate_public_id, editable=False, db_index=True)
    must_change_password = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    phone_number = models.CharField(
        max_length=20, blank=True, default="",
        help_text="Optional phone number for contact discovery.",
    )
    gender = models.CharField(
        max_length=10,
        choices=Gender.choices,
        blank=True,
        default="",
        help_text="User gender (male or female).",
    )
    avatar = models.CharField(
        max_length=50, blank=True, default="",
        help_text="Preset student avatar identifier.",
    )

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
        email_changed = False
        if self.pk and (kwargs.get("update_fields") is None or "email" in kwargs["update_fields"]):
            old_email = type(self).objects.filter(pk=self.pk).values_list("email", flat=True).first()
            if old_email and old_email != self.email:
                email_changed = True
                self.email_verified_at = None
                self.trusted_browser_hash = ""
                if kwargs.get("update_fields"):
                    kwargs["update_fields"] = set(kwargs["update_fields"]) | {"email_verified_at", "trusted_browser_hash"}
        super().save(*args, **kwargs)
        if email_changed:
            from django.utils import timezone
            from knox.models import AuthToken
            from rest_framework.authtoken.models import Token
            AuthToken.objects.filter(user=self).delete()
            Token.objects.filter(user=self).delete()
            EmailSignInChallenge.objects.filter(user=self, consumed_at__isnull=True).update(consumed_at=timezone.now())

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


class StudentFollow(models.Model):
    """Directional follow relationship between students.
    When two students follow each other, they become 'Buddies' (mutual friends).
    """
    follower = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="following_set",
        help_text="The student who initiated the follow.",
    )
    following = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="follower_set",
        help_text="The student being followed.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("follower", "following")
        ordering = ("-created_at",)
        verbose_name = "Student Follow"
        verbose_name_plural = "Student Follows"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.follower_id == self.following_id:
            raise ValidationError("A student cannot follow themselves.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.follower} \u2192 {self.following}"


class StudentBlock(models.Model):
    blocker = models.ForeignKey(User, on_delete=models.CASCADE, related_name="student_blocks")
    blocked = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocked_by_students")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("blocker", "blocked"), name="unique_student_block_pair"),
            models.CheckConstraint(condition=~models.Q(blocker=models.F("blocked")), name="no_self_student_block"),
        ]


class BuddyMessage(models.Model):
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_buddy_messages")
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="received_buddy_messages")
    client_id = models.UUIDField(default=uuid.uuid4)
    body = models.TextField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("id",)
        constraints = [
            models.UniqueConstraint(fields=("sender", "client_id"), name="unique_sender_message_client"),
            models.CheckConstraint(condition=~models.Q(sender=models.F("recipient")), name="no_self_buddy_message"),
        ]
        indexes = [
            models.Index(fields=("sender", "recipient", "id"), name="buddy_dialog_out_idx"),
            models.Index(fields=("recipient", "sender", "id"), name="buddy_dialog_in_idx"),
            models.Index(fields=("recipient", "read_at"), name="buddy_unread_idx"),
        ]


class FeedbackPromptState(models.Model):
    user = models.OneToOneField(User, primary_key=True, on_delete=models.CASCADE, related_name="feedback_prompt_state")
    next_test_count = models.PositiveIntegerField(default=3)
    last_prompt_at = models.DateTimeField(null=True, blank=True)
    last_prompt_session = models.UUIDField(null=True, blank=True)


class EmailSignInChallenge(models.Model):
    """Only keyed digests are retained; no plaintext codes or browser keys."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_signin_challenges")
    email = models.EmailField()
    browser_hash = models.CharField(max_length=64)
    password_fingerprint = models.CharField(max_length=64)
    code_hash = models.CharField(max_length=64)
    is_transfer = models.BooleanField(default=False)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=("user", "-created_at"), name="email_signin_user_created_idx")]


class AccountSecurityPolicy(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    grace_until = models.DateTimeField()
    version = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="security_policy_updates")

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(id=1), name="single_account_security_policy")]


class AccountSecurityPolicyChange(models.Model):
    previous_deadline = models.DateTimeField(null=True)
    new_deadline = models.DateTimeField()
    reason = models.CharField(max_length=240)
    changed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="security_policy_changes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-pk")


class StudentFeedback(models.Model):
    class Category(models.TextChoices):
        GENERAL = "general", "General feedback"
        IMPROVEMENT = "improvement", "Suggest an improvement"
        BUG = "bug", "Report a problem"
        SAFETY = "safety", "Message safety report"

    class Status(models.TextChoices):
        NEW = "new", "Received"
        REVIEWING = "reviewing", "Under review"
        DONE = "done", "Reviewed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="feedback_submissions")
    client_id = models.UUIDField(default=uuid.uuid4)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.GENERAL)
    body = models.TextField(max_length=4000)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW)
    admin_note = models.TextField(max_length=2000, blank=True)
    reported_message = models.ForeignKey(BuddyMessage, on_delete=models.SET_NULL, null=True, blank=True, related_name="safety_reports")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(fields=("user", "client_id"), name="unique_student_feedback_client"),
            models.UniqueConstraint(fields=("user", "reported_message"), name="unique_feedback_message_report"),
        ]
        indexes = [models.Index(fields=("status", "-created_at"), name="student_feedback_inbox_idx")]
