import hashlib
import hmac
import json
import logging
import sys
import urllib.request
import uuid

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    PlanConfig,
    CourseAccess,
    PaymentTransaction,
    MonetizationEvent,
)
from .access_policy import (
    SEMESTER_ACCESS_PRICE,
    has_full_university_access,
    is_university_user,
)

logger = logging.getLogger(__name__)


def _complete_verified_payment(tx, config, gateway_response):
    """Apply a verified payment exactly once, regardless of callback ordering."""
    if tx.status == PaymentTransaction.Status.SUCCESS:
        return False
    if (
        tx.access_type != PaymentTransaction.AccessType.ALL_ACCESS
        or tx.amount != SEMESTER_ACCESS_PRICE
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
    Public configuration for the fixed semester pass and the user's current access.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        config = PlanConfig.get_solo()
        user = request.user if request.user.is_authenticated else None
        user_access = CourseAccess.get_user_access_summary(user)

        return Response({
            "semester_price": SEMESTER_ACCESS_PRICE,
            "semester_end_date": config.semester_end_date.isoformat(),
            "limited_access_days": config.limited_access_days,
            "screenshot_protection_enabled": config.screenshot_protection_enabled,
            "paystack_public_key": config.paystack_public_key or getattr(settings, "PAYSTACK_PUBLIC_KEY", ""),
            "user_access": user_access,
        })


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
        access_type = PaymentTransaction.AccessType.ALL_ACCESS
        requested_access_type = str(request.data.get("access_type") or "").strip()
        if requested_access_type and requested_access_type != PaymentTransaction.AccessType.ALL_ACCESS:
            return Response({"detail": "Only the ₦2,500 university semester pass is available."}, status=status.HTTP_410_GONE)
        if str(request.data.get("discount_code") or "").strip():
            return Response({"detail": "Discount codes are no longer available. The semester pass has a fixed price of ₦2,500."}, status=status.HTTP_410_GONE)
        if config.semester_end_date <= timezone.now():
            return Response({"detail": "The current semester access period has ended. Please contact Seomtorch support."}, status=status.HTTP_400_BAD_REQUEST)
        if has_full_university_access(request.user):
            return Response({"detail": "Your university semester pass is already active."}, status=status.HTTP_409_CONFLICT)

        amount = SEMESTER_ACCESS_PRICE

        reference = f"seom_{int(timezone.now().timestamp())}_{uuid.uuid4().hex[:8]}"

        tx = PaymentTransaction.objects.create(
            reference=reference,
            user=request.user,
            amount=amount,
            status=PaymentTransaction.Status.PENDING,
            access_type=access_type,
            course_code="all",
            gateway="paystack",
        )

        MonetizationEvent.objects.create(
            user=request.user,
            event_name="payment_started",
            metadata={
                "reference": reference,
                "amount": amount,
                "access_type": access_type,
                "course_code": "all",
                "semester_end_date": config.semester_end_date.isoformat(),
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
            "course_code": "all",
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

        if tx.access_type != PaymentTransaction.AccessType.ALL_ACCESS or tx.amount != SEMESTER_ACCESS_PRICE:
            return Response({"detail": "This legacy transaction cannot unlock the current university semester pass."}, status=status.HTTP_410_GONE)

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
                            and tx.access_type == PaymentTransaction.AccessType.ALL_ACCESS
                            and tx.amount == SEMESTER_ACCESS_PRICE
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
