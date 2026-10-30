import uuid
from datetime import timedelta
from django.conf import settings
from django.db import models
from django.utils import timezone


class PlanConfig(models.Model):
    """
    Singleton configuration for all monetization prices, dates, and limits.
    Editable in Django Admin. Nothing hardcoded.
    """
    single_course_price = models.PositiveIntegerField(
        default=1500,
        help_text="Standard price for 1 course per semester (NGN).",
    )
    all_access_price = models.PositiveIntegerField(
        default=3000,
        help_text="Standard price for all 3 courses per semester (NGN).",
    )
    launch_offer_price = models.PositiveIntegerField(
        default=2000,
        help_text="Special launch offer price for all-access (NGN).",
    )
    launch_offer_active = models.BooleanField(
        default=True,
        help_text="Enable or disable the launch offer.",
    )
    launch_offer_end_date = models.DateTimeField(
        null=True, blank=True,
        help_text="Expiry date for the launch offer (e.g. Nov 15, 2026).",
    )
    launch_offer_max_buyers = models.PositiveIntegerField(
        default=100,
        help_text="Maximum number of users who can claim the launch offer.",
    )
    launch_offer_buyers_count = models.PositiveIntegerField(
        default=0,
        help_text="Current number of users who claimed the launch offer.",
    )
    semester_end_date = models.DateTimeField(
        help_text="Semester end date when all paid access expires (e.g. March 31, 2027).",
    )
    trial_duration_days = models.PositiveIntegerField(
        default=3,
        help_text="Full-access trial duration in days from user signup.",
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
        return f"Plan Configuration (Single: ₦{self.single_course_price:,} · All: ₦{self.all_access_price:,})"

    @classmethod
    def get_solo(cls):
        """Fetch or create the singleton instance with sensible defaults."""
        obj, created = cls.objects.get_or_create(
            id=1,
            defaults={
                "single_course_price": 1500,
                "all_access_price": 3000,
                "launch_offer_price": 2000,
                "launch_offer_active": True,
                "launch_offer_end_date": timezone.now() + timedelta(days=18),
                "launch_offer_max_buyers": 100,
                "launch_offer_buyers_count": 0,
                "semester_end_date": timezone.now() + timedelta(days=150),
                "trial_duration_days": 3,
                "screenshot_protection_enabled": True,
            }
        )
        return obj

    @property
    def is_launch_offer_valid(self):
        """Check if launch offer is currently available."""
        if not self.launch_offer_active:
            return False
        if self.launch_offer_end_date and timezone.now() > self.launch_offer_end_date:
            return False
        if self.launch_offer_max_buyers and self.launch_offer_buyers_count >= self.launch_offer_max_buyers:
            return False
        return True

    @property
    def current_all_access_price(self):
        """Returns 2000 during valid launch offer, otherwise 3000."""
        return self.launch_offer_price if self.is_launch_offer_valid else self.all_access_price


class DiscountCode(models.Model):
    """
    Class or departmental promo codes (e.g. MEDILAG24) for group discounts.
    """
    class PlanType(models.TextChoices):
        ALL_ACCESS = "all_access", "All-Access Only"
        SINGLE_COURSE = "single_course", "Single Course Only"
        ANY = "any", "Any Plan"

    code = models.CharField(max_length=40, unique=True, db_index=True)
    label = models.CharField(max_length=120, help_text="e.g. UNILAG MBBS 200L, LASU Nursing 200L")
    target_plan = models.CharField(max_length=20, choices=PlanType.choices, default=PlanType.ALL_ACCESS)
    discounted_price = models.PositiveIntegerField(help_text="Custom price to pay with this code (e.g. 2500).")
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

    def is_valid_for(self, plan="all_access"):
        if not self.is_active:
            return False, "This discount code is currently inactive."
        if self.expires_at and timezone.now() > self.expires_at:
            return False, "This discount code has expired."
        if self.max_uses and self.times_used >= self.max_uses:
            return False, "This discount code has reached its maximum uses."
        if self.target_plan != self.PlanType.ANY and self.target_plan != plan:
            return False, f"This code applies only to {self.get_target_plan_display()}."
        return True, "Valid"


class CourseAccess(models.Model):
    """
    Tracks unlocked courses or trial for each student.
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
        return self.is_active and timezone.now() <= self.expires_at

    @classmethod
    def user_has_course_access(cls, user, course_code):
        """
        Check if student has active access to a course (via trial, all-access, or single course).
        """
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        now = timezone.now()
        normalized_code = str(course_code).strip().upper()
        return cls.objects.filter(
            user=user,
            is_active=True,
            expires_at__gte=now,
        ).filter(
            models.Q(access_type__in=[cls.AccessType.ALL_ACCESS, cls.AccessType.TRIAL]) |
            models.Q(course_code__iexact=normalized_code)
        ).exists()

    @classmethod
    def get_user_access_summary(cls, user):
        """
        Returns summary dictionary of what courses are unlocked and trial status.
        """
        if not user or not user.is_authenticated:
            return {
                "has_all_access": False,
                "unlocked_courses": [],
                "is_trial": False,
                "trial_days_remaining": 0,
                "trial_used": False,
                "expires_at": None,
            }
        now = timezone.now()
        valid_grants = cls.objects.filter(user=user, is_active=True, expires_at__gte=now)
        has_all = valid_grants.filter(access_type__in=[cls.AccessType.ALL_ACCESS, cls.AccessType.TRIAL]).exists()
        trial_grant = valid_grants.filter(access_type=cls.AccessType.TRIAL).first()
        trial_used = cls.objects.filter(user=user, access_type=cls.AccessType.TRIAL).exists()

        unlocked = []
        if has_all:
            unlocked = ["all", "ANA 201", "ANA 203", "PIO 201"]
        else:
            for g in valid_grants:
                if g.course_code:
                    unlocked.append(g.course_code.upper())

        latest_expiry = valid_grants.aggregate(models.Max("expires_at"))["expires_at__max"]
        trial_days_left = 0
        if trial_grant:
            delta = trial_grant.expires_at - now
            trial_days_left = max(0, delta.days + (1 if delta.seconds > 0 else 0))

        return {
            "has_all_access": has_all,
            "unlocked_courses": list(set(unlocked)),
            "is_trial": bool(trial_grant),
            "trial_days_remaining": trial_days_left,
            "trial_used": trial_used,
            "expires_at": latest_expiry.isoformat() if latest_expiry else None,
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


class CourseTopicConfig(models.Model):
    """
    Admin control to mark each topic as free or paid, and designate the free showcase topic.
    """
    course_code = models.CharField(max_length=40, unique=True, help_text="e.g. ANA 201, ANA 203, PIO 201")
    free_topic_id = models.CharField(max_length=120, default="", help_text="ID of the topic that is free (e.g. 'ul-bones').")
    showcase_note_id = models.CharField(max_length=120, blank=True, default="", help_text="ID or filename of the showcase note.")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Course Topic Access Configuration"
        verbose_name_plural = "Course Topic Access Configurations"

    def __str__(self):
        return f"{self.course_code} (Free Topic: {self.free_topic_id or 'First topic'})"


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
