import hashlib
import hmac
import json
import logging
import sys
import urllib.request
import uuid

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    PlanConfig,
    CourseAccess,
    DiscountCode,
    PartnerStudentMembership,
    PaymentTransaction,
    MonetizationEvent,
)
from .access_policy import (
    is_university_user,
)
from learning.models import Subject

logger = logging.getLogger(__name__)


def _complete_verified_payment(tx, config, gateway_response):
    """Apply a verified payment exactly once, regardless of callback ordering."""
    if tx.status == PaymentTransaction.Status.SUCCESS:
        return False
    if (
        tx.access_type not in {PaymentTransaction.AccessType.ALL_ACCESS, PaymentTransaction.AccessType.SINGLE_COURSE}
        or tx.amount <= 0
        or not is_university_user(tx.user)
        or config.semester_end_date <= timezone.now()
    ):
        return False

    now = timezone.now()
    tx.status = PaymentTransaction.Status.SUCCESS
    tx.paid_at = now
    tx.gateway_response = gateway_response or {}
    tx.gateway_reference = str((gateway_response or {}).get("reference") or tx.reference)
    tx.save(update_fields=("status", "paid_at", "gateway_response", "gateway_reference"))

    CourseAccess.objects.get_or_create(
        reference=tx.reference,
        defaults={
            "user": tx.user,
            "access_type": tx.access_type,
            "course_code": tx.course_code or "all",
            "starts_at": now,
            "expires_at": config.semester_end_date,
            "is_active": True,
            "granted_by": CourseAccess.GrantedBy.PAYMENT,
        },
    )
    if tx.discount_code_id:
        DiscountCode.objects.filter(pk=tx.discount_code_id).update(times_used=F("times_used") + 1)
        if tx.discount_code.partner_organization_id:
            membership, created = PartnerStudentMembership.objects.get_or_create(
                user=tx.user,
                defaults={"organization_id": tx.discount_code.partner_organization_id, "discount_code": tx.discount_code},
            )
            if not created and membership.organization_id != tx.discount_code.partner_organization_id:
                logger.warning("Partner attribution conflict for paid code %s; original affiliation retained.", tx.discount_code.code)
    MonetizationEvent.objects.create(
        user=tx.user,
        event_name="payment_succeeded",
        metadata={"reference": tx.reference, "amount": tx.amount, "access_type": tx.access_type},
    )
    MonetizationEvent.objects.create(
        user=tx.user,
        event_name="package_bought",
        metadata={"package": tx.access_type, "course": tx.course_code},
    )
    return True


class SubscriptionConfigView(APIView):
    """
    Public configuration for university purchase plans and the user's current access.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        config = PlanConfig.get_solo()
        user = request.user if request.user.is_authenticated else None
        user_access = CourseAccess.get_user_access_summary(user)

        return Response({
            "semester_price": config.all_access_price,
            "all_access_price": config.all_access_price,
            "single_course_price": config.single_course_price,
            "university_courses": list(Subject.objects.filter(track=Subject.Track.UNIVERSITY, is_active=True).exclude(code="").order_by("position", "code").values("code", "name")),
            "semester_end_date": config.semester_end_date.isoformat(),
            "limited_access_days": config.limited_access_days,
            "screenshot_protection_enabled": config.screenshot_protection_enabled,
            "paystack_public_key": config.paystack_public_key or getattr(settings, "PAYSTACK_PUBLIC_KEY", ""),
            "user_access": user_access,
        })


class ValidateDiscountCodeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        code = str(request.data.get("code") or "").strip().upper()
        access_type = str(request.data.get("access_type") or "").strip()
        course_code = str(request.data.get("course_code") or "").strip().upper()
        config = PlanConfig.get_solo()
        if access_type not in {PaymentTransaction.AccessType.ALL_ACCESS, PaymentTransaction.AccessType.SINGLE_COURSE}:
            return Response({"detail": "Choose a valid purchase plan."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            discount = DiscountCode.objects.select_related("partner_organization").get(code__iexact=code)
        except DiscountCode.DoesNotExist:
            return Response({"valid": False, "detail": "That discount code was not found."}, status=status.HTTP_404_NOT_FOUND)
        valid, reason = discount.is_valid_for(access_type)
        if not valid:
            return Response({"valid": False, "detail": reason}, status=status.HTTP_400_BAD_REQUEST)
        if access_type == PaymentTransaction.AccessType.SINGLE_COURSE and not Subject.objects.filter(track=Subject.Track.UNIVERSITY, code__iexact=course_code, is_active=True).exists():
            return Response({"detail": "Choose an available university course."}, status=status.HTTP_400_BAD_REQUEST)
        if discount.partner_organization_id:
            existing = PartnerStudentMembership.objects.filter(user=request.user).values_list("organization_id", flat=True).first()
            if existing and existing != discount.partner_organization_id:
                return Response({"valid": False, "detail": "Your account is already linked to another partner institution. Contact Seomtorch support if this is incorrect."}, status=status.HTTP_409_CONFLICT)
        base_price = config.all_access_price if access_type == PaymentTransaction.AccessType.ALL_ACCESS else config.single_course_price
        if discount.discounted_price <= 0 or discount.discounted_price >= base_price:
            return Response({"valid": False, "detail": "This code is not configured with a valid reduced price."}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"valid": True, "code": discount.code, "label": discount.label, "amount": discount.discounted_price, "base_price": base_price, "partner": discount.partner_organization.name if discount.partner_organization_id else None})


class InitializePaymentView(APIView):
    """
    Prepare a checkout payment session for Paystack.
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        config = PlanConfig.get_solo()
        if not is_university_user(request.user):
            return Response({"detail": "This university semester pass is available to university accounts only."}, status=status.HTTP_403_FORBIDDEN)
        access_type = str(request.data.get("access_type") or PaymentTransaction.AccessType.ALL_ACCESS).strip()
        course_code = str(request.data.get("course_code") or "").strip().upper()
        if access_type not in {PaymentTransaction.AccessType.ALL_ACCESS, PaymentTransaction.AccessType.SINGLE_COURSE}:
            return Response({"detail": "Choose a valid university access plan."}, status=status.HTTP_400_BAD_REQUEST)
        if access_type == PaymentTransaction.AccessType.SINGLE_COURSE and not Subject.objects.filter(track=Subject.Track.UNIVERSITY, code__iexact=course_code, is_active=True).exists():
            return Response({"detail": "That course is not available for purchase."}, status=status.HTTP_400_BAD_REQUEST)
        if config.semester_end_date <= timezone.now():
            return Response({"detail": "The current semester access period has ended. Please contact Seomtorch support."}, status=status.HTTP_400_BAD_REQUEST)
        selected_course = course_code if access_type == PaymentTransaction.AccessType.SINGLE_COURSE else "all"
        if CourseAccess.user_has_course_access(request.user, selected_course):
            return Response({"detail": "Your university semester pass is already active."}, status=status.HTTP_409_CONFLICT)

        base_amount = config.all_access_price if access_type == PaymentTransaction.AccessType.ALL_ACCESS else config.single_course_price
        if base_amount < 1:
            logger.error("University access price is invalid for plan %s", access_type)
            return Response({"detail": "This university access plan is temporarily unavailable. Please contact Seomtorch support."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        amount = base_amount
        code_str = str(request.data.get("discount_code") or "").strip().upper()
        discount = None
        if code_str:
            try:
                discount = DiscountCode.objects.select_for_update().select_related("partner_organization").get(code__iexact=code_str)
            except DiscountCode.DoesNotExist:
                return Response({"detail": "That discount code was not found."}, status=status.HTTP_404_NOT_FOUND)
            valid, reason = discount.is_valid_for(access_type)
            if not valid:
                return Response({"detail": reason}, status=status.HTTP_400_BAD_REQUEST)
            if discount.discounted_price <= 0 or discount.discounted_price >= base_amount:
                return Response({"detail": "This code is not configured with a valid reduced price."}, status=status.HTTP_400_BAD_REQUEST)
            if discount.max_uses:
                pending = PaymentTransaction.objects.filter(discount_code=discount, status=PaymentTransaction.Status.PENDING).count()
                if discount.times_used + pending >= discount.max_uses:
                    return Response({"detail": "This discount code has reached its maximum uses."}, status=status.HTTP_400_BAD_REQUEST)
            if discount.partner_organization_id:
                existing_org = PartnerStudentMembership.objects.filter(user=request.user).values_list("organization_id", flat=True).first()
                if existing_org and existing_org != discount.partner_organization_id:
                    return Response({"detail": "Your account is already linked to another partner institution."}, status=status.HTTP_409_CONFLICT)
            amount = discount.discounted_price

        reference = f"seom_{int(timezone.now().timestamp())}_{uuid.uuid4().hex[:8]}"

        tx = PaymentTransaction.objects.create(
            reference=reference,
            user=request.user,
            amount=amount,
            status=PaymentTransaction.Status.PENDING,
            access_type=access_type,
            course_code=selected_course,
            discount_code=discount,
            gateway="paystack",
        )

        MonetizationEvent.objects.create(
            user=request.user,
            event_name="payment_started",
            metadata={
                "reference": reference,
                "amount": amount,
                "access_type": access_type,
                "course_code": selected_course,
                "semester_end_date": config.semester_end_date.isoformat(),
                "discount_code": discount.code if discount else None,
            }
        )

        public_key = config.paystack_public_key or getattr(settings, "PAYSTACK_PUBLIC_KEY", "")

        return Response({
            "reference": tx.reference,
            "amount": tx.amount,
            "amount_kobo": tx.amount * 100,
            "currency": "NGN",
            "email": request.user.email,
            "public_key": public_key,
            "access_type": access_type,
            "course_code": selected_course,
        }, status=status.HTTP_201_CREATED)


class VerifyPaymentView(APIView):
    """
    Verify payment result and activate student course access.
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        config = PlanConfig.get_solo()
        reference = str(request.data.get("reference") or "").strip()
        if not reference:
            return Response({"detail": "Transaction reference is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tx = PaymentTransaction.objects.select_for_update().get(reference=reference, user=request.user)
        except PaymentTransaction.DoesNotExist:
            return Response({"detail": "Transaction not found."}, status=status.HTTP_404_NOT_FOUND)

        if tx.access_type not in {PaymentTransaction.AccessType.ALL_ACCESS, PaymentTransaction.AccessType.SINGLE_COURSE} or tx.amount <= 0:
            return Response({"detail": "This legacy transaction cannot unlock current university access."}, status=status.HTTP_410_GONE)

        if tx.status == PaymentTransaction.Status.SUCCESS:
            return Response({
                "status": "success",
                "message": "Payment already verified.",
                "user_access": CourseAccess.get_user_access_summary(request.user),
            })

        verified = False
        secret_key = config.paystack_secret_key or getattr(settings, "PAYSTACK_SECRET_KEY", "")

        if secret_key:
            # Query Paystack verification API
            try:
                url = f"https://api.paystack.co/transaction/verify/{reference}"
                req = urllib.request.Request(url, headers={
                    "Authorization": f"Bearer {secret_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Seomtorch-Backend/1.0",
                })
                with urllib.request.urlopen(req, timeout=12) as response:
                    paystack_data = json.loads(response.read().decode("utf-8"))
                    verified_data = paystack_data.get("data") or {}
                    if (
                        paystack_data.get("status")
                        and verified_data.get("status") == "success"
                        and str(verified_data.get("reference") or "") == tx.reference
                        and str(verified_data.get("currency") or "").upper() == "NGN"
                        and isinstance(verified_data.get("amount"), int)
                        and not isinstance(verified_data.get("amount"), bool)
                        and verified_data.get("amount") == tx.amount * 100
                    ):
                        customer_email = str((verified_data.get("customer") or {}).get("email") or "").strip().lower()
                        if customer_email and customer_email == tx.user.email.strip().lower():
                            verified = True
                            tx.gateway_response = verified_data
                            tx.gateway_reference = verified_data.get("reference", "")
            except Exception as e:
                logger.error("Paystack verification error for %s: %s", reference, e)
                return Response({"detail": "Could not verify payment with gateway. Please try again shortly or contact support."}, status=status.HTTP_502_BAD_GATEWAY)
        else:
            is_testing = getattr(settings, "TESTING", False) or ("test" in sys.argv)
            if is_testing:
                verified = True
                tx.gateway_response = {"note": "Test mode verification (no secret key configured)."}
            else:
                return Response({"detail": "Payment gateway is not configured. Please contact support."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not verified:
            tx.status = PaymentTransaction.Status.FAILED
            tx.save()
            MonetizationEvent.objects.create(
                user=request.user,
                event_name="payment_failed",
                metadata={"reference": reference, "amount": tx.amount}
            )
            return Response({"detail": "Payment was not successful."}, status=status.HTTP_400_BAD_REQUEST)

        if not _complete_verified_payment(tx, config, tx.gateway_response):
            return Response({"detail": "The current university semester pass is no longer available. Contact support if you were charged."}, status=status.HTTP_409_CONFLICT)

        return Response({
            "status": "success",
            "message": "Payment verified! Your course access is now active.",
            "user_access": CourseAccess.get_user_access_summary(request.user),
        })


class PaystackWebhookView(APIView):
    """
    Paystack server-to-server webhook callback.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        config = PlanConfig.get_solo()
        secret_key = config.paystack_secret_key or getattr(settings, "PAYSTACK_SECRET_KEY", "")
        signature = request.META.get("HTTP_X_PAYSTACK_SIGNATURE")

        if not secret_key:
            logger.error("Paystack webhook rejected because no secret key is configured.")
            return Response({"detail": "Payment gateway is not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if not signature:
            return Response({"detail": "Missing Paystack signature."}, status=status.HTTP_400_BAD_REQUEST)
        computed = hmac.new(secret_key.encode("utf-8"), request.body, hashlib.sha512).hexdigest()
        if not hmac.compare_digest(computed, signature):
            return Response({"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

        event_data = request.data or {}
        event_name = event_data.get("event")

        if event_name == "charge.success":
            data = event_data.get("data", {})
            reference = data.get("reference")
            if reference:
                if data.get("status") != "success":
                    return Response({"detail": "Payment status is not successful."}, status=status.HTTP_400_BAD_REQUEST)
                try:
                    with transaction.atomic():
                        tx = PaymentTransaction.objects.select_for_update().get(reference=reference)
                        customer_email = str((data.get("customer") or {}).get("email") or "").strip().lower()
                        valid_payment = (
                            str(data.get("reference") or "") == tx.reference
                            and tx.access_type in {PaymentTransaction.AccessType.ALL_ACCESS, PaymentTransaction.AccessType.SINGLE_COURSE}
                            and str(data.get("currency") or "").upper() == "NGN"
                              and isinstance(data.get("amount"), int)
                              and not isinstance(data.get("amount"), bool)
                              and data.get("amount") == tx.amount * 100
                              and bool(customer_email)
                              and customer_email == tx.user.email.strip().lower()
                        )
                        if not valid_payment:
                            return Response({"detail": "Payment details do not match the pending transaction."}, status=status.HTTP_400_BAD_REQUEST)
                        if tx.status != PaymentTransaction.Status.SUCCESS and not _complete_verified_payment(tx, config, data):
                            return Response({"detail": "The current university semester pass is no longer available."}, status=status.HTTP_409_CONFLICT)
                except PaymentTransaction.DoesNotExist:
                    logger.warning("Paystack webhook received unknown reference: %s", reference)
                    return Response({"detail": "Unknown transaction reference."}, status=status.HTTP_404_NOT_FOUND)

        return Response({"status": "received"}, status=status.HTTP_200_OK)


class UserAccessSummaryView(APIView):
    """
    Returns current student access summary.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(CourseAccess.get_user_access_summary(request.user))


class LogMonetizationEventView(APIView):
    """
    Log client-side monetization funnel events.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        event_name = str(request.data.get("event_name") or "").strip()
        metadata = request.data.get("metadata") or {}
        user = request.user if request.user.is_authenticated else None

        if not event_name:
            return Response({"detail": "event_name is required."}, status=status.HTTP_400_BAD_REQUEST)

        MonetizationEvent.objects.create(
            user=user,
            event_name=event_name[:60],
            metadata=metadata if isinstance(metadata, dict) else {"raw": metadata},
        )
        return Response({"status": "logged"}, status=status.HTTP_201_CREATED)
