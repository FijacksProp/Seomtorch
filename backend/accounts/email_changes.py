import logging
import secrets
import uuid
from datetime import timedelta

from django.db import transaction, IntegrityError
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from rest_framework import serializers
from .models import User, EmailChangeRequest, EmailSignInChallenge
from .email_security import browser_digest, digest, enabled_for, issue_token, check_email_rate_limit, _send_payload, DeliveryUnavailable
from django.conf import settings

logger = logging.getLogger(__name__)


def mask_email(email):
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


def check_browser(user, browser_hash):
    if user.must_change_password:
        raise serializers.ValidationError("Change your temporary password before updating your email.")
    if user.is_staff:
        raise serializers.ValidationError("Staff email changes must use the administrator recovery process.")
    if not user.is_active:
        raise serializers.ValidationError("This account is not available.")
    if enabled_for(user) and user.trusted_browser_hash and not constant_time_compare(user.trusted_browser_hash, browser_hash):
        raise serializers.ValidationError("Use your active browser to change your email. Sign in again if necessary.")


def send_change_codes(change, old_code, new_code):
    base = {"sender": {"name": settings.BREVO_SENDER_NAME, "email": settings.BREVO_SENDER_EMAIL}}
    _send_payload({**base, "to": [{"email": change.old_email}], "subject": "Seomtorch · Approve your email change",
        "textContent": f"Your CURRENT-EMAIL approval code is {old_code}. It expires in 5 minutes.\n\nSomeone requested changing your Seomtorch email to {mask_email(change.new_email)}. Only enter this code if you requested this change. A separate code is required from the new inbox. Never share either code. If this wasn't you, ignore this request; your email has not changed."})
    _send_payload({**base, "to": [{"email": change.new_email}], "subject": "Seomtorch · Verify your new email",
        "textContent": f"Your NEW-EMAIL verification code is {new_code}. It expires in 5 minutes.\n\nEnter it together with the approval code from your current email to finish the change. Your account email stays unchanged until both codes are confirmed. Never share your code. If you did not request this, ignore this email."})


def valid_pending(user, value, browser_hash):
    request_id = serializers.UUIDField().run_validation(value)
    change = EmailChangeRequest.objects.select_for_update().filter(pk=request_id, user=user).first()
    if not change or change.consumed_at or change.old_email != user.email or not constant_time_compare(change.password_fingerprint, digest(user.password, "password")) or not constant_time_compare(change.browser_hash, browser_hash):
        raise serializers.ValidationError("This email-change request is no longer available. Start again from your account.")
    return change


def request_change(user, browser_key, *, current_password=None, new_email=None, resend_id=None):
    browser_hash = browser_digest(browser_key)
    failed = False
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user.pk)
        check_browser(user, browser_hash)
        if resend_id:
            previous = valid_pending(user, resend_id, browser_hash)
            if previous.created_at < timezone.now() - timedelta(minutes=30):
                raise serializers.ValidationError("This request has expired. Enter your password to start again.")
            target = previous.new_email
        else:
            if not isinstance(current_password, str) or not user.check_password(current_password):
                raise serializers.ValidationError({"current_password": "Your current password is incorrect."})
            target = serializers.EmailField(max_length=254).run_validation(new_email).strip().lower()
        if target == user.email:
            raise serializers.ValidationError({"new_email": "Enter a different email address."})
        if User.objects.filter(email__iexact=target).exclude(pk=user.pk).exists():
            raise serializers.ValidationError({"new_email": "This email address cannot be used. Choose another address."})
        check_email_rate_limit(user, cost=2)
        now = timezone.now()
        EmailChangeRequest.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=now)
        EmailSignInChallenge.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=now)
        request_id = uuid.uuid4()
        old_code = f"{secrets.randbelow(1000000):06d}"
        new_code = f"{secrets.randbelow(1000000):06d}"
        while new_code == old_code:
            new_code = f"{secrets.randbelow(1000000):06d}"
        change = EmailChangeRequest.objects.create(id=request_id, user=user, old_email=user.email, new_email=target,
            browser_hash=browser_hash, password_fingerprint=digest(user.password, "password"),
            old_code_hash=digest(f"{request_id}:{old_code}", "email-change-current"),
            new_code_hash=digest(f"{request_id}:{new_code}", "email-change-new"), expires_at=now + timedelta(minutes=5))
        try:
            send_change_codes(change, old_code, new_code)
        except DeliveryUnavailable:
            change.consumed_at = now
            change.save(update_fields=("consumed_at",))
            failed = True
    if failed:
        raise DeliveryUnavailable()
    return {"request_id": str(change.id), "current_email": mask_email(change.old_email), "new_email": mask_email(change.new_email), "expires_in": 300, "resend_after": 60}


def _notify_previous_inbox(email, new_email):
    try:
        _send_payload({"sender": {"name": settings.BREVO_SENDER_NAME, "email": settings.BREVO_SENDER_EMAIL},
            "to": [{"email": email}], "subject": "Seomtorch · Your email was changed",
            "textContent": f"Your Seomtorch account email has been changed to {mask_email(new_email)} after approval from both inboxes. Your progress and subscription are unchanged. Other browser sign-ins were revoked. If you did not approve this change, contact Seomtorch support immediately. Never send anyone your password or verification codes."})
    except DeliveryUnavailable:
        logger.warning("Email-change security notification was not accepted; account change remains committed.")


def confirm_change(user, request_id, browser_key, old_code, new_code):
    browser_hash = browser_digest(browser_key)
    error = None
    try:
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=user.pk)
            check_browser(user, browser_hash)
            change = valid_pending(user, request_id, browser_hash)
            now = timezone.now()
            if change.expires_at <= now or change.attempts >= 5:
                error = "These codes have expired or reached the attempt limit. Request a new pair of codes."
            else:
                change.attempts += 1
                shaped = all(isinstance(code, str) and len(code) == 6 and code.isascii() and code.isdigit() for code in (old_code, new_code))
                old_matches = constant_time_compare(change.old_code_hash, digest(f"{change.id}:{old_code}", "email-change-current")) if shaped else False
                new_matches = constant_time_compare(change.new_code_hash, digest(f"{change.id}:{new_code}", "email-change-new")) if shaped else False
                if not old_matches or not new_matches:
                    change.save(update_fields=("attempts",))
                    error = "One or both codes are incorrect. Use the latest pair and check which inbox each code came from."
                elif User.objects.filter(email__iexact=change.new_email).exclude(pk=user.pk).exists():
                    error = "The new address is no longer available. Start again with a different email."
                else:
                    user.email = change.new_email
                    # User.save revokes every token and pending code on an email change.
                    user.save(update_fields=("email",))
                    user.email_verified_at = now
                    user.trusted_browser_hash = browser_hash
                    user.save(update_fields=("email_verified_at", "trusted_browser_hash"))
                    change.consumed_at = change.accepted_at = now
                    change.save(update_fields=("attempts", "consumed_at", "accepted_at"))
                    token = issue_token(user)
                    from learning.models import ActivityEvent
                    ActivityEvent.objects.create(user=user, event_type=ActivityEvent.Type.SIGNED_IN, metadata={"reason": "email_changed"})
                    transaction.on_commit(lambda: _notify_previous_inbox(change.old_email, change.new_email))
    except IntegrityError:
        raise serializers.ValidationError("The new address could not be saved. Your previous email is unchanged. Please try a different address.") from None
    if error:
        raise serializers.ValidationError({"detail": error})
    return user, token
