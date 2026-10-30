from django.contrib import admin, messages
from django.utils import timezone
from .models import (
    PlanConfig,
    DiscountCode,
    CourseAccess,
    PaymentTransaction,
    CourseTopicConfig,
    MonetizationEvent,
)


@admin.register(PlanConfig)
class PlanConfigAdmin(admin.ModelAdmin):
    list_display = (
        "__str__",
        "single_course_price",
        "all_access_price",
        "launch_offer_price",
        "launch_offer_active",
        "screenshot_protection_enabled",
        "launch_offer_buyers_count",
        "launch_offer_max_buyers",
        "semester_end_date",
        "trial_duration_days",
    )
    fieldsets = (
        ("Standard Semester Pricing (NGN)", {
            "fields": ("single_course_price", "all_access_price", "semester_end_date"),
            "description": "Base prices and semester expiration date for university courses.",
        }),
        ("Launch Offer (Auto-reverting)", {
            "fields": (
                "launch_offer_active",
                "launch_offer_price",
                "launch_offer_end_date",
                "launch_offer_max_buyers",
                "launch_offer_buyers_count",
            ),
            "description": "Discounted launch price that automatically returns to standard price when max buyers or end date is reached.",
        }),
        ("Trial & Gateway Settings", {
            "fields": ("trial_duration_days", "paystack_public_key", "paystack_secret_key"),
            "description": "3-day trial settings and Paystack API keys.",
        }),
        ("Security & Screen Protection", {
            "fields": ("screenshot_protection_enabled",),
            "description": "Controls anti-screenshot blur, tab-switch obscuring, and watermark overlay across the student app.",
        }),
    )

    def has_add_permission(self, request):
        # Enforce singleton
        return not PlanConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(DiscountCode)
class DiscountCodeAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "label",
        "discounted_price",
        "target_plan",
        "times_used",
        "max_uses",
        "expires_at",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "target_plan", "created_at")
    search_fields = ("code", "label")
    readonly_fields = ("times_used", "created_at")


@admin.register(CourseAccess)
class CourseAccessAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "access_type",
        "course_code",
        "starts_at",
        "expires_at",
        "is_active",
        "granted_by",
        "reference",
    )
    list_filter = ("access_type", "course_code", "is_active", "granted_by")
    search_fields = ("user__email", "user__username", "user__public_id", "course_code", "reference")
    autocomplete_fields = ("user",)
    actions = ["grant_all_access_semester", "grant_ana201_semester", "revoke_access"]

    @admin.action(description="Grant ALL-ACCESS until Semester End Date")
    def grant_all_access_semester(self, request, queryset):
        config = PlanConfig.get_solo()
        count = 0
        for access in queryset:
            access.access_type = CourseAccess.AccessType.ALL_ACCESS
            access.course_code = "all"
            access.expires_at = config.semester_end_date
            access.is_active = True
            access.granted_by = CourseAccess.GrantedBy.ADMIN_MANUAL
            access.reference = f"admin_manual_{request.user.username}_{int(timezone.now().timestamp())}"
            access.save()
            count += 1
        messages.success(request, f"Updated {count} access grants to ALL-ACCESS until {config.semester_end_date.strftime('%Y-%m-%d')}.")

    @admin.action(description="Grant ANA 201 until Semester End Date")
    def grant_ana201_semester(self, request, queryset):
        config = PlanConfig.get_solo()
        count = 0
        for access in queryset:
            access.access_type = CourseAccess.AccessType.SINGLE_COURSE
            access.course_code = "ANA 201"
            access.expires_at = config.semester_end_date
            access.is_active = True
            access.granted_by = CourseAccess.GrantedBy.ADMIN_MANUAL
            access.reference = f"admin_manual_{request.user.username}_{int(timezone.now().timestamp())}"
            access.save()
            count += 1
        messages.success(request, f"Updated {count} access grants to ANA 201 until {config.semester_end_date.strftime('%Y-%m-%d')}.")

    @admin.action(description="Revoke selected access grants")
    def revoke_access(self, request, queryset):
        count = queryset.update(is_active=False)
        messages.warning(request, f"Revoked {count} access grants.")


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "user",
        "amount",
        "status",
        "access_type",
        "course_code",
        "discount_code",
        "paid_at",
        "created_at",
    )
    list_filter = ("status", "access_type", "gateway", "created_at")
    search_fields = ("reference", "user__email", "user__username", "user__public_id", "gateway_reference")
    readonly_fields = ("created_at", "paid_at")
    actions = ["manually_unlock_transaction"]

    @admin.action(description="Manually confirm payment & unlock student access")
    def manually_unlock_transaction(self, request, queryset):
        config = PlanConfig.get_solo()
        count = 0
        for tx in queryset.filter(status__in=[PaymentTransaction.Status.PENDING, PaymentTransaction.Status.FAILED]):
            tx.status = PaymentTransaction.Status.SUCCESS
            tx.paid_at = timezone.now()
            tx.gateway_response = {"note": f"Manually verified by admin {request.user.username}"}
            tx.save()

            CourseAccess.objects.create(
                user=tx.user,
                access_type=tx.access_type,
                course_code=tx.course_code or "all",
                starts_at=timezone.now(),
                expires_at=config.semester_end_date,
                is_active=True,
                granted_by=CourseAccess.GrantedBy.ADMIN_MANUAL,
                reference=tx.reference,
            )
            count += 1
        messages.success(request, f"Successfully verified and unlocked access for {count} transactions.")


@admin.register(CourseTopicConfig)
class CourseTopicConfigAdmin(admin.ModelAdmin):
    list_display = ("course_code", "free_topic_id", "showcase_note_id", "updated_at")
    search_fields = ("course_code", "free_topic_id")


@admin.register(MonetizationEvent)
class MonetizationEventAdmin(admin.ModelAdmin):
    list_display = ("event_name", "user", "metadata", "created_at")
    list_filter = ("event_name", "created_at")
    search_fields = ("event_name", "user__email", "user__username")
    readonly_fields = ("created_at",)
