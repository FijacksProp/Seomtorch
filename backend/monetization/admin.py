from django.contrib import admin, messages
from django.utils import timezone
from .models import (
    PlanConfig,
    DiscountCode,
    CourseAccess,
    PaymentTransaction,
    MonetizationEvent,
)
from .access_policy import SEMESTER_ACCESS_PRICE, is_university_user


@admin.register(PlanConfig)
class PlanConfigAdmin(admin.ModelAdmin):
    list_display = ("semester_pass_price", "limited_access_days", "semester_end_date", "screenshot_protection_enabled", "updated_at")
    readonly_fields = ("semester_pass_price",)
    fieldsets = (
        ("University Semester Access", {
            "fields": ("semester_pass_price", "limited_access_days", "semester_end_date"),
            "description": "The pass is fixed at ₦2,500. Set the university preview duration and current semester end date.",
        }),
        ("Paystack", {"fields": ("paystack_public_key", "paystack_secret_key")}),
        ("Security & Screen Protection", {
            "fields": ("screenshot_protection_enabled",),
            "description": "Controls anti-screenshot blur, tab-switch obscuring, and watermark overlay across the student app.",
        }),
    )

    def has_add_permission(self, request):
        # Enforce singleton
        return not PlanConfig.objects.exists()

    @admin.display(description="Semester pass price")
    def semester_pass_price(self, obj):
        return f"₦{SEMESTER_ACCESS_PRICE:,}"

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

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


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
    actions = ["revoke_access"]

    @admin.action(description="Revoke selected paid access grants")
    def revoke_access(self, request, queryset):
        count = queryset.update(is_active=False)
        messages.warning(request, f"Revoked {count} access grants.")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        return tuple(field.name for field in self.model._meta.fields)


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
        for tx in queryset.filter(status__in=[PaymentTransaction.Status.PENDING, PaymentTransaction.Status.FAILED], amount=SEMESTER_ACCESS_PRICE, access_type=PaymentTransaction.AccessType.ALL_ACCESS):
            if not is_university_user(tx.user):
                continue
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
                granted_by=CourseAccess.GrantedBy.PAYMENT,
                reference=tx.reference,
            )
            count += 1
        messages.success(request, f"Successfully verified and unlocked access for {count} transactions.")


@admin.register(MonetizationEvent)
class MonetizationEventAdmin(admin.ModelAdmin):
    list_display = ("event_name", "user", "metadata", "created_at")
    list_filter = ("event_name", "created_at")
    search_fields = ("event_name", "user__email", "user__username")
    readonly_fields = ("created_at",)
