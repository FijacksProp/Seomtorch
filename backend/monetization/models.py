import uuid
from datetime import timedelta
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class PlanConfig(models.Model):
    """Singleton configuration for the active university semester end date and payment keys."""
    semester_end_date = models.DateTimeField(
        help_text="Semester end date when all paid access expires (e.g. March 31, 2027).",
    )
    all_access_price = models.PositiveIntegerField(default=3000, help_text="Editable NGN price for full university access for the semester.")
    single_course_price = models.PositiveIntegerField(default=1500, help_text="Editable NGN price for one university course for the semester.")
    limited_access_days = models.PositiveSmallIntegerField(
        default=14,
        validators=[MinValueValidator(1), MaxValueValidator(365)],
        help_text="Number of days university students receive limited access after registration (1–365).",
    )
    paystack_public_key = models.CharField(
        max_length=150, blank=True, default="",
        help_text="Paystack Public Key (starts with pk_live_ or pk_test_).",
    )
    paystack_secret_key = models.CharField(
        max_length=150, blank=True, default="",
        help_text="Paystack Secret Key (starts with sk_live_ or sk_test_).",
    )
    screenshot_protection_enabled = models.BooleanField(
        default=True,
        help_text="When True, blocks screenshots, blurs screen on switch, and displays watermarks. Set False for marketing/screenshot capture.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Plan & Pricing Configuration"
        verbose_name_plural = "Plan & Pricing Configuration"

    def __str__(self):
        return f"University Semester Configuration (ends {self.semester_end_date:%Y-%m-%d})"

    def clean(self):
        errors = {}
        if self.all_access_price < 1:
            errors["all_access_price"] = "All-course access must cost at least ₦1."
        if self.single_course_price < 1:
            errors["single_course_price"] = "Single-course access must cost at least ₦1."
        if errors:
            raise ValidationError(errors)

    @classmethod
    def get_solo(cls):
        """Fetch or create the singleton instance with sensible defaults."""
        obj, created = cls.objects.get_or_create(
            id=1,
            defaults={
                "semester_end_date": timezone.now() + timedelta(days=150),
                "limited_access_days": 14,
                "screenshot_protection_enabled": True,
            }
        )
        return obj


class DiscountCode(models.Model):
    """
    Class or departmental promo codes (e.g. MEDILAG24) for group discounts.
    """
    class PlanType(models.TextChoices):
        ALL_ACCESS = "all_access", "All-Access Only"
        SINGLE_COURSE = "single_course", "Single Course Only"

    code = models.CharField(max_length=40, unique=True, db_index=True)
    label = models.CharField(max_length=120, help_text="e.g. UNILAG MBBS 200L, LASU Nursing 200L")
    target_plan = models.CharField(max_length=20, choices=PlanType.choices, default=PlanType.ALL_ACCESS)
    discounted_price = models.PositiveIntegerField(help_text="Fixed final checkout price in NGN; must be less than the selected plan price.")
    partner_organization = models.ForeignKey("PartnerOrganization", null=True, blank=True, on_delete=models.SET_NULL, related_name="discount_codes")
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True, help_text="Optional expiration date.")
    max_uses = models.PositiveIntegerField(null=True, blank=True, help_text="Maximum total uses allowed.")
    times_used = models.PositiveIntegerField(default=0, help_text="How many students have redeemed this code.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Discount / Class Code"
        verbose_name_plural = "Discount / Class Codes"

    def __str__(self):
        return f"{self.code} (₦{self.discounted_price:,}) – {self.label}"

    def clean(self):
        if self.code:
            self.code = self.code.strip().upper()
        if self.discounted_price < 1:
            raise ValidationError({"discounted_price": "Discount codes must have a final price of at least ₦1."})

    def is_valid_for(self, plan="all_access"):
        if not self.is_active:
            return False, "This discount code is currently inactive."
        if self.expires_at and timezone.now() >= self.expires_at:
            return False, "This discount code has expired."
        if self.partner_organization_id and not self.partner_organization.is_active:
            return False, "This institute’s discount code is currently unavailable."
        if self.max_uses and self.times_used >= self.max_uses:
            return False, "This discount code has reached its maximum uses."
        if self.target_plan != plan:
            return False, f"This code applies only to {self.get_target_plan_display()}."
        return True, "Valid"


class PartnerOrganization(models.Model):
    name = models.CharField(max_length=180, unique=True)
    slug = models.SlugField(max_length=200, unique=True)
    contact_email = models.EmailField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)
        verbose_name = "Partner institution"
        verbose_name_plural = "Partner institutions"

    def __str__(self):
        return self.name


class PartnerAdminMembership(models.Model):
    organization = models.ForeignKey(PartnerOrganization, on_delete=models.CASCADE, related_name="admins")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="partner_admin_memberships")
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="partner_admin_invites_sent")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("organization", "user"), name="unique_partner_admin_membership")]
        indexes = [models.Index(fields=("user", "is_active"), name="monetizati_user_id_77f584_idx")]

    def __str__(self):
        return f"{self.user.username} · {self.organization.name}"


class PartnerStudentMembership(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="partner_student_membership")
    organization = models.ForeignKey(PartnerOrganization, on_delete=models.PROTECT, related_name="students")
    discount_code = models.ForeignKey(DiscountCode, null=True, blank=True, on_delete=models.SET_NULL, related_name="attributed_students")
    linked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=("organization", "linked_at"), name="monetizati_org_id_955201_idx")]

    def __str__(self):
        return f"{self.user.public_id} · {self.organization.name}"


class CourseAccess(models.Model):
    """
    Tracks university semester-pass entitlements. Legacy rows remain available for audit.
    """
    class AccessType(models.TextChoices):
        TRIAL = "trial", "3-Day Free Trial"
        SINGLE_COURSE = "single_course", "Single Course Access"
        ALL_ACCESS = "all_access", "All-Access (All Courses)"

    class GrantedBy(models.TextChoices):
        PAYMENT = "payment", "Online Payment"
        TRIAL = "trial", "Automatic Signup Trial"
        ADMIN_MANUAL = "admin_manual", "Admin Manual Grant"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="course_accesses")
    access_type = models.CharField(max_length=20, choices=AccessType.choices)
    course_code = models.CharField(
        max_length=30,
        default="all",
        help_text="e.g. 'ANA 201', 'ANA 203', 'PIO 201', or 'all' for All-Access/Trial.",
    )
    starts_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    granted_by = models.CharField(max_length=20, choices=GrantedBy.choices, default=GrantedBy.PAYMENT)
    granted_by_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="manual_access_grants_created")
    admin_note = models.TextField(blank=True, default="")
    reference = models.CharField(max_length=120, blank=True, default="", help_text="Payment or audit reference.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Student Course Access"
        verbose_name_plural = "Student Course Access Grants"
        indexes = [
            models.Index(fields=("user", "is_active", "expires_at")),
            models.Index(fields=("course_code", "is_active")),
        ]

    def __str__(self):
        return f"{self.user.username} · {self.get_access_type_display()} ({self.course_code}) until {self.expires_at.strftime('%Y-%m-%d')}"

    @property
    def is_currently_valid(self):
        now = timezone.now()
        return (
            self.is_active
            and self.access_type in {self.AccessType.ALL_ACCESS, self.AccessType.SINGLE_COURSE}
            and self.granted_by in {self.GrantedBy.PAYMENT, self.GrantedBy.ADMIN_MANUAL}
            and self.starts_at <= now <= self.expires_at
        )

    @classmethod
    def user_has_course_access(cls, user, course_code):
        """
        Check for a currently valid paid or explicitly staff-granted course entitlement.
        """
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        from .access_policy import is_university_user
        if not is_university_user(user):
            return False
        now = timezone.now()
        return cls.objects.filter(
            user=user,
            is_active=True,
            granted_by__in=(cls.GrantedBy.PAYMENT, cls.GrantedBy.ADMIN_MANUAL),
            starts_at__lte=now,
            expires_at__gte=now,
        ).filter(
            models.Q(access_type=cls.AccessType.ALL_ACCESS)
            | models.Q(access_type=cls.AccessType.SINGLE_COURSE, course_code__iexact=str(course_code or ""))
        ).exists()

    @classmethod
    def get_user_access_summary(cls, user):
        """
        Returns the current semester-pass and registration-based limited-access status.
        """
        if not user or not user.is_authenticated:
            return {
                "has_all_access": False,
                "unlocked_courses": [],
                "is_trial": False,
                "trial_days_remaining": 0,
                "trial_used": False,
                "limited_access_active": False,
                "limited_access_days_remaining": 0,
                "limited_access_expires_at": None,
                "limited_access_duration_days": 14,
                "preview_active": False,
                "access_percentage": 0,
                "access_status": "not_applicable",
                "semester_price": 3000,
                "single_course_price": 1500,
                "expires_at": None,
            }
        from .access_policy import (
            limited_access_end,
            limited_access_duration_days,
            limited_access_is_applicable,
            limited_access_is_in_preview,
            limited_access_percentage,
        )

        from .access_policy import is_university_user
        is_university = is_university_user(user)
        now = timezone.now()
        valid_grants = cls.objects.filter(
            user=user,
            is_active=True,
            access_type__in=(cls.AccessType.ALL_ACCESS, cls.AccessType.SINGLE_COURSE),
            granted_by__in=(cls.GrantedBy.PAYMENT, cls.GrantedBy.ADMIN_MANUAL),
            starts_at__lte=now,
            expires_at__gte=now,
        ) if is_university else cls.objects.none()
        full_grants = valid_grants.filter(access_type=cls.AccessType.ALL_ACCESS)
        course_grants = valid_grants.filter(access_type=cls.AccessType.SINGLE_COURSE).values_list("course_code", flat=True)
        has_all = user.is_staff or user.is_superuser or (is_university and full_grants.exists())

        unlocked = [str(code).upper() for code in course_grants]
        if has_all:
            unlocked = ["all"]
        next_expiry = valid_grants.aggregate(models.Min("expires_at"))["expires_at__min"]
        limited_access_applicable = limited_access_is_applicable(user)
        limited_days = limited_access_duration_days() if limited_access_applicable else 0
        limited_end = limited_access_end(user, days=limited_days) if limited_days else None
        preview_active = limited_access_is_in_preview(user, now=now, end=limited_end) if limited_end else False
        access_percentage = limited_access_percentage(user, now=now, end=limited_end)
        limited_active = access_percentage > 0
        limited_days_left = max(0, (limited_end - now).days + (1 if limited_end and (limited_end - now).seconds > 0 else 0)) if preview_active else 0
        plan_config = PlanConfig.get_solo()

        return {
            "has_all_access": has_all,
            "unlocked_courses": list(set(unlocked)),
            "is_trial": False,
            "trial_days_remaining": 0,
            "trial_used": False,
            "limited_access_active": limited_active,
            "preview_active": preview_active,
            "limited_access_days_remaining": limited_days_left,
            "limited_access_expires_at": limited_end.isoformat() if limited_end else None,
            "limited_access_duration_days": limited_days,
            "access_percentage": 100 if has_all else access_percentage,
            "access_status": "full" if has_all else "partial" if unlocked else "preview" if preview_active else "sample" if limited_active else "not_applicable",
            "semester_price": plan_config.all_access_price,
            "single_course_price": plan_config.single_course_price,
            "expires_at": next_expiry.isoformat() if next_expiry else None,
        }


class PaymentTransaction(models.Model):
    """
    Log of every payment initiated and completed via Paystack.
    """
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        ABANDONED = "abandoned", "Abandoned"

    class AccessType(models.TextChoices):
        ALL_ACCESS = "all_access", "All-Access"
        SINGLE_COURSE = "single_course", "Single Course"

    reference = models.CharField(max_length=120, unique=True, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payment_transactions")
    amount = models.PositiveIntegerField(help_text="Amount in NGN (e.g. 2000).")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    access_type = models.CharField(max_length=20, choices=AccessType.choices, default=AccessType.ALL_ACCESS)
    course_code = models.CharField(max_length=40, blank=True, default="all")
    discount_code = models.ForeignKey(DiscountCode, null=True, blank=True, on_delete=models.SET_NULL, related_name="transactions")
    gateway = models.CharField(max_length=30, default="paystack")
    gateway_reference = models.CharField(max_length=120, blank=True, default="")
    gateway_response = models.JSONField(default=dict, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Payment Transaction"
        verbose_name_plural = "Payment Transactions"

    def __str__(self):
        return f"{self.reference} · {self.user.username} · ₦{self.amount:,} ({self.status})"


class MonetizationEvent(models.Model):
    """
    Audit log and conversion tracking for monetization events.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="monetization_events")
    event_name = models.CharField(max_length=60, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Monetization Event"
        verbose_name_plural = "Monetization Events"

    def __str__(self):
        username = self.user.username if self.user else "Anonymous"
        return f"{self.event_name} by {username} at {self.created_at.strftime('%Y-%m-%d %H:%M')}"
