import hashlib
import hmac
import json
import logging
import urllib.request
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    PlanConfig,
    DiscountCode,
    CourseAccess,
    PaymentTransaction,
    CourseTopicConfig,
    MonetizationEvent,
)

logger = logging.getLogger(__name__)


def _get_free_topics_map():
    configs = CourseTopicConfig.objects.all()
    free_map = {
        "ANA 201": "ul-bones",
        "ANA 203": "week-one",
        "PIO 201": "transport-homeostasis",
    }
    for c in configs:
        if c.free_topic_id:
            free_map[c.course_code.upper()] = c.free_topic_id
    return free_map


class SubscriptionConfigView(APIView):
    """
    Public live config for plans, prices, launch offer status, and user's current access.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        config = PlanConfig.get_solo()
        user = request.user if request.user.is_authenticated else None
        user_access = CourseAccess.get_user_access_summary(user)

        launch_valid = config.is_launch_offer_valid
        remaining_spots = max(0, config.launch_offer_max_buyers - config.launch_offer_buyers_count)

        return Response({
            "single_course_price": config.single_course_price,
            "all_access_price": config.all_access_price,
            "current_all_access_price": config.current_all_access_price,
            "launch_offer": {
                "active": launch_valid,
                "price": config.launch_offer_price,
                "end_date": config.launch_offer_end_date.isoformat() if config.launch_offer_end_date else None,
                "max_buyers": config.launch_offer_max_buyers,
                "buyers_count": config.launch_offer_buyers_count,
                "spots_remaining": remaining_spots,
            },
            "semester_end_date": config.semester_end_date.isoformat(),
            "trial_duration_days": config.trial_duration_days,
            "paystack_public_key": config.paystack_public_key or getattr(settings, "PAYSTACK_PUBLIC_KEY", ""),
            "user_access": user_access,
            "free_topics": _get_free_topics_map(),
        })


class ValidateDiscountCodeView(APIView):
    """
    Validate a class or promo code at checkout.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        code_str = str(request.data.get("code") or "").strip().upper()
        plan = str(request.data.get("plan") or "all_access").strip().lower()
        if not code_str:
            return Response({"valid": False, "detail": "Enter a valid code."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            discount = DiscountCode.objects.get(code__iexact=code_str)
        except DiscountCode.DoesNotExist:
            return Response({"valid": False, "detail": "Invalid discount code."}, status=status.HTTP_404_NOT_FOUND)

        is_valid, msg = discount.is_valid_for(plan)
        if not is_valid:
            return Response({"valid": False, "detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "valid": True,
            "code": discount.code,
            "label": discount.label,
            "discounted_price": discount.discounted_price,
            "target_plan": discount.target_plan,
        })


class InitializePaymentView(APIView):
    """
    Prepare a checkout payment session for Paystack.
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        config = PlanConfig.get_solo()
        access_type = str(request.data.get("access_type") or "all_access").strip().lower()
        course_code = str(request.data.get("course_code") or "").strip()
        code_str = str(request.data.get("discount_code") or "").strip().upper()

        if access_type == "single_course" and not course_code:
            return Response({"detail": "Course code is required for single course purchase."}, status=status.HTTP_400_BAD_REQUEST)

        discount_code_obj = None
        amount = 0

        # Check discount code first
        if code_str:
            try:
                discount = DiscountCode.objects.get(code__iexact=code_str)
                is_valid, msg = discount.is_valid_for(access_type)
                if is_valid:
                    discount_code_obj = discount
                    amount = discount.discounted_price
                else:
                    return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
            except DiscountCode.DoesNotExist:
                return Response({"detail": "Invalid discount code."}, status=status.HTTP_404_NOT_FOUND)

        if not amount:
            if access_type == "all_access":
                amount = config.current_all_access_price
            else:
                amount = config.single_course_price

        reference = f"seom_{int(timezone.now().timestamp())}_{uuid.uuid4().hex[:8]}"

        tx = PaymentTransaction.objects.create(
            reference=reference,
            user=request.user,
            amount=amount,
            status=PaymentTransaction.Status.PENDING,
            access_type=access_type,
            course_code=course_code if access_type == "single_course" else "all",
            discount_code=discount_code_obj,
            gateway="paystack",
        )

        MonetizationEvent.objects.create(
            user=request.user,
            event_name="payment_started",
            metadata={
                "reference": reference,
                "amount": amount,
                "access_type": access_type,
                "course_code": course_code,
                "discount_code": code_str or None,
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
            "course_code": tx.course_code,
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
                })
                with urllib.request.urlopen(req, timeout=12) as response:
                    paystack_data = json.loads(response.read().decode("utf-8"))
                    if paystack_data.get("status") and paystack_data.get("data", {}).get("status") == "success":
                        paid_kobo = paystack_data["data"].get("amount", 0)
                        if paid_kobo >= (tx.amount * 100):
                            verified = True
                            tx.gateway_response = paystack_data.get("data", {})
                            tx.gateway_reference = paystack_data.get("data", {}).get("reference", "")
            except Exception as e:
                logger.error("Paystack verification error for %s: %s", reference, e)
                return Response({"detail": "Could not verify payment with gateway. Please try again shortly or contact support."}, status=status.HTTP_502_BAD_GATEWAY)
        else:
            # Test development mode (before keys are configured)
            verified = True
            tx.gateway_response = {"note": "Test mode verification (no secret key configured)."}

        if not verified:
            tx.status = PaymentTransaction.Status.FAILED
            tx.save()
            MonetizationEvent.objects.create(
                user=request.user,
                event_name="payment_failed",
                metadata={"reference": reference, "amount": tx.amount}
            )
            return Response({"detail": "Payment was not successful."}, status=status.HTTP_400_BAD_REQUEST)

        # Mark success
        tx.status = PaymentTransaction.Status.SUCCESS
        tx.paid_at = timezone.now()
        tx.save()

        # Update launch offer count if applicable
        if tx.access_type == PaymentTransaction.AccessType.ALL_ACCESS and not tx.discount_code and config.is_launch_offer_valid:
            PlanConfig.objects.filter(id=config.id).update(launch_offer_buyers_count=models.F("launch_offer_buyers_count") + 1)

        # Update discount code usage
        if tx.discount_code:
            DiscountCode.objects.filter(id=tx.discount_code_id).update(times_used=models.F("times_used") + 1)

        # Unlock student access until semester end date
        CourseAccess.objects.create(
            user=request.user,
            access_type=tx.access_type,
            course_code=tx.course_code or "all",
            starts_at=timezone.now(),
            expires_at=config.semester_end_date,
            is_active=True,
            granted_by=CourseAccess.GrantedBy.PAYMENT,
            reference=tx.reference,
        )

        MonetizationEvent.objects.create(
            user=request.user,
            event_name="payment_succeeded",
            metadata={"reference": reference, "amount": tx.amount, "access_type": tx.access_type}
        )
        MonetizationEvent.objects.create(
            user=request.user,
            event_name="package_bought",
            metadata={"package": tx.access_type, "course": tx.course_code}
        )

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

        if secret_key and signature:
            computed = hmac.new(secret_key.encode("utf-8"), request.body, hashlib.sha512).hexdigest()
            if not hmac.compare_digest(computed, signature):
                return Response({"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

        event_data = request.data or {}
        event_name = event_data.get("event")

        if event_name == "charge.success":
            data = event_data.get("data", {})
            reference = data.get("reference")
            if reference:
                try:
                    with transaction.atomic():
                        tx = PaymentTransaction.objects.select_for_update().get(reference=reference)
                        if tx.status != PaymentTransaction.Status.SUCCESS:
                            tx.status = PaymentTransaction.Status.SUCCESS
                            tx.paid_at = timezone.now()
                            tx.gateway_response = data
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
                            if tx.access_type == PaymentTransaction.AccessType.ALL_ACCESS and not tx.discount_code and config.is_launch_offer_valid:
                                PlanConfig.objects.filter(id=config.id).update(launch_offer_buyers_count=models.F("launch_offer_buyers_count") + 1)
                            if tx.discount_code:
                                DiscountCode.objects.filter(id=tx.discount_code_id).update(times_used=models.F("times_used") + 1)
                except PaymentTransaction.DoesNotExist:
                    logger.warning("Paystack webhook received unknown reference: %s", reference)

        return Response({"status": "received"}, status=status.HTTP_200_OK)


class StartTrialView(APIView):
    """
    Redeem the 3-day full-access trial (once per student account).
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        config = PlanConfig.get_solo()
        user = request.user

        # Check if user ever redeemed a trial
        existing_trial = CourseAccess.objects.filter(user=user, access_type=CourseAccess.AccessType.TRIAL).exists()
        if existing_trial:
            return Response({
                "detail": "You have already redeemed your 3-day free trial on this account.",
                "user_access": CourseAccess.get_user_access_summary(user),
            }, status=status.HTTP_400_BAD_REQUEST)

        trial_days = config.trial_duration_days or 3
        now = timezone.now()
        expires = now + timedelta(days=trial_days)

        trial = CourseAccess.objects.create(
            user=user,
            access_type=CourseAccess.AccessType.TRIAL,
            course_code="all",
            starts_at=now,
            expires_at=expires,
            is_active=True,
            granted_by=CourseAccess.GrantedBy.TRIAL,
            reference=f"trial_{user.public_id}",
        )

        MonetizationEvent.objects.create(
            user=user,
            event_name="trial_started",
            metadata={"expires_at": expires.isoformat(), "trial_days": trial_days}
        )

        return Response({
            "status": "success",
            "message": f"Your {trial_days}-day full-access trial is active! Explore all courses, explanations, and notes.",
            "user_access": CourseAccess.get_user_access_summary(user),
        }, status=status.HTTP_201_CREATED)


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
