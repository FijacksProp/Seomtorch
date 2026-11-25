from django.contrib import admin, messages
from django.db.models import F
from django.utils import timezone
from .models import (
    PlanConfig,
    DiscountCode,
    CourseAccess,
    PaymentTransaction,
    MonetizationEvent,
    PartnerOrganization,
    PartnerAdminMembership,
    PartnerStudentMembership,
)
from .access_policy import is_university_user


@admin.register(PlanConfig)
class PlanConfigAdmin(admin.ModelAdmin):
    list_display = ("all_access_price", "single_course_price", "limited_access_days", "semester_end_date", "screenshot_protection_enabled", "updated_at")
    fieldsets = (
        ("University Semester Access", {
            "fields": ("all_access_price", "single_course_price", "limited_access_days", "semester_end_date"),
            "description": "Set the university preview duration and current semester end date. Prices apply to new purchases only.",
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
        "partner_organization",
        "partner_commission_amount",
        "paid_at",
        "created_at",
    )
    list_filter = ("status", "access_type", "gateway", "created_at")
    search_fields = ("reference", "user__email", "user__username", "user__public_id", "gateway_reference")
    readonly_fields = ("created_at", "paid_at", "partner_organization", "partner_commission_amount", "partner_attribution_source")
    actions = ["manually_unlock_transaction"]

    @admin.action(description="Manually confirm payment & unlock student access")
    def manually_unlock_transaction(self, request, queryset):
        config = PlanConfig.get_solo()
        count = 0
        for tx in queryset.filter(status__in=[PaymentTransaction.Status.PENDING, PaymentTransaction.Status.FAILED], amount__gt=0, access_type__in=[PaymentTransaction.AccessType.ALL_ACCESS, PaymentTransaction.AccessType.SINGLE_COURSE]):
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
            if tx.discount_code_id:
                DiscountCode.objects.filter(pk=tx.discount_code_id).update(times_used=F("times_used") + 1)
            partner_id = tx.partner_organization_id or (tx.discount_code.partner_organization_id if tx.discount_code_id else None)
            if partner_id:
                PartnerStudentMembership.objects.get_or_create(
                    user=tx.user,
                    defaults={
                        "organization_id": partner_id,
                        "discount_code": tx.discount_code if tx.discount_code_id else None,
                        "attribution_source": tx.partner_attribution_source or PartnerStudentMembership.AttributionSource.DISCOUNT_CODE,
                    },
                )
            count += 1
        messages.success(request, f"Successfully verified and unlocked access for {count} transactions.")


@admin.register(MonetizationEvent)
class MonetizationEventAdmin(admin.ModelAdmin):
    list_display = ("event_name", "user", "metadata", "created_at")
    list_filter = ("event_name", "created_at")
    search_fields = ("event_name", "user__email", "user__username")
    readonly_fields = ("created_at",)


@admin.register(PartnerOrganization)
class PartnerOrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "commission_amount", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug", "contact_email")
    readonly_fields = ("commission_amount",)


@admin.register(PartnerAdminMembership)
class PartnerAdminMembershipAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "is_active", "invited_by", "created_at")
    list_filter = ("is_active", "organization")
    search_fields = ("organization__name", "user__email", "user__username")


@admin.register(PartnerStudentMembership)
class PartnerStudentMembershipAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "attribution_source", "discount_code", "linked_at")
    list_filter = ("organization",)
    search_fields = ("organization__name", "user__public_id", "user__username")
