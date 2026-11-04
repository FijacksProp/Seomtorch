"""Password + email approval for a single active student browser session."""
import json
import secrets
import uuid
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.crypto import salted_hmac, constant_time_compare
from django.utils.dateparse import parse_datetime
from knox.models import AuthToken
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import APIException, Throttled, ValidationError

from .models import EmailSignInChallenge, User, AccountSecurityPolicy, EmailChangeRequest


class DeliveryUnavailable(APIException):
    status_code = 503
    default_detail = "We couldn’t send your code right now. Your current sign-in is unchanged. Please try later or contact support."


def digest(value, purpose):
    return salted_hmac(f"seomtorch.{purpose}", value, algorithm="sha256").hexdigest()


def browser_digest(value):
    if not isinstance(value, str) or not 32 <= len(value) <= 128 or not value.isascii() or not value.isalnum():
        raise ValidationError({"browser_key": "This browser could not establish secure storage. Enable site storage and retry."})
    return digest(value, "browser")


def enabled_for(user):
    return settings.ACCOUNT_SECURITY_ENABLED and not user.is_staff


def effective_grace_deadline():
    # Read shared database state, not a worker-local cache: edits affect all workers.
    stored = AccountSecurityPolicy.objects.filter(pk=1).values_list("grace_until", flat=True).first()
    if stored is not None:
        return stored
    return parse_datetime(settings.ACCOUNT_SECURITY_GRACE_UNTIL) if settings.ACCOUNT_SECURITY_GRACE_UNTIL else None


def security_status(user):
    enabled = enabled_for(user)
    # Verified accounts are unaffected by grace edits; avoid a policy query on
    # every answer submission/chat poll for these students.
    deadline = effective_grace_deadline() if enabled and not user.email_verified_at else None
    required = enabled and not user.email_verified_at and (not deadline or timezone.now() >= deadline)
    local, _, domain = user.email.partition("@")
    return {"enabled": enabled, "email_verified": bool(user.email_verified_at), "verification_required": bool(required),
            "email_change_available": bool(settings.BREVO_API_KEY and settings.BREVO_SENDER_EMAIL and not user.is_staff),
            "grace_until": deadline.isoformat() if enabled and deadline else None,
            "masked_email": f"{local[:1]}***@{domain}", "single_signin": enabled and bool(user.email_verified_at)}


def send_code(email, code, transfer=False):
    """HTTPS API works on Render free; no SMTP ports or extra SDK required."""
    if not settings.BREVO_API_KEY or not settings.BREVO_SENDER_EMAIL:
        raise DeliveryUnavailable()
    action = "move your Seomtorch sign-in to another browser" if transfer else "verify your email and secure your Seomtorch sign-in"
    payload = {"sender": {"name": settings.BREVO_SENDER_NAME, "email": settings.BREVO_SENDER_EMAIL},
               "to": [{"email": email}], "subject": "Your Seomtorch verification code",
               "textContent": f"SEOMTORCH · Prepare with purpose\n\nYour code is {code}.\n\nUse it within 5 minutes to {action}. Confirming signs out other browsers.\n\nNever share this code. Our team will never ask for it. If you did not request it, ignore this email; your current sign-in is unchanged.",
               "headers": {"X-Mailin-Track-Clicks": "0", "X-Mailin-Track-Opens": "0"}}
    _send_payload(payload)


def send_delivery_test(email):
    _send_payload({"sender": {"name": settings.BREVO_SENDER_NAME, "email": settings.BREVO_SENDER_EMAIL},
        "to": [{"email": email}], "subject": "Seomtorch · Email delivery test",
        "textContent": "This is a Seomtorch email delivery check. No sign-in was requested, no account was changed, and this message contains no usable verification code. If this arrived promptly, check the visible sender and Brevo delivery logs before enabling account verification."})


def _send_payload(payload):
    if not settings.BREVO_API_KEY or not settings.BREVO_SENDER_EMAIL:
        raise DeliveryUnavailable()
    request = Request("https://api.brevo.com/v3/smtp/email", data=json.dumps(payload).encode(),
                      headers={"api-key": settings.BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=10) as response:
            if response.status not in (200, 201, 202):
                raise DeliveryUnavailable()
    except (HTTPError, URLError, TimeoutError, OSError):
        # Never log provider bodies, recipient addresses, API keys or OTPs.
        raise DeliveryUnavailable() from None


def check_transfer_limit(user):
    used = EmailSignInChallenge.objects.filter(user=user, is_transfer=True, accepted_at__gte=timezone.now() - timedelta(days=30)).count()
    if used >= settings.ACCOUNT_SECURITY_MAX_TRANSFERS:
        raise ValidationError({"detail": "Your browser-transfer limit has been reached. Your current browser still works. Contact support if you changed or lost your device."})


def check_email_rate_limit(user, cost=1):
    """Caller holds the user lock. Preserve actual send cost for older two-code requests."""
    now = timezone.now()
    logins = EmailSignInChallenge.objects.filter(user=user)
    changes = EmailChangeRequest.objects.filter(user=user)
    latest = [value for value in (logins.order_by("-created_at").values_list("created_at", flat=True).first(), changes.order_by("-created_at").values_list("created_at", flat=True).first()) if value]
    if latest and (now - max(latest)).total_seconds() < 60:
        raise Throttled(wait=max(1, int(60 - (now - max(latest)).total_seconds())))
    for window, limit in [(timedelta(hours=1), 5), (timedelta(days=1), 10)]:
        total = logins.filter(created_at__gte=now - window).count() + (changes.filter(created_at__gte=now - window).aggregate(total=Sum("code_email_count"))["total"] or 0)
        if total + cost > limit:
            raise Throttled(detail="Too many email-code requests. Please try again later.", wait=3600)


def issue_challenge(user, browser_key):
    browser_hash = browser_digest(browser_key)
    delivery_failed = False
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user.pk)
        if not enabled_for(user):
            raise ValidationError("Email approval is not enabled for this account yet.")
        now = timezone.now()
        recent = EmailSignInChallenge.objects.filter(user=user)
        check_email_rate_limit(user)
        transfer = bool(user.trusted_browser_hash and not constant_time_compare(user.trusted_browser_hash, browser_hash))
        if transfer:
            check_transfer_limit(user)
        recent.filter(consumed_at__isnull=True).update(consumed_at=now)
        EmailChangeRequest.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=now)
        challenge_id = uuid.uuid4()
        code = f"{secrets.randbelow(1000000):06d}"
        challenge = EmailSignInChallenge.objects.create(id=challenge_id, user=user, email=user.email, browser_hash=browser_hash,
            password_fingerprint=digest(user.password, "password"), code_hash=digest(f"{challenge_id}:{code}", "otp"),
            expires_at=now + timedelta(minutes=5), is_transfer=transfer)
        try:
            send_code(user.email, code, transfer)
        except DeliveryUnavailable:
            challenge.consumed_at = now
            challenge.save(update_fields=("consumed_at",))
            delivery_failed = True
    # Raise outside atomic so failed deliveries still count toward anti-spam limits.
    if delivery_failed:
        raise DeliveryUnavailable()
    return {"verification_required": True, "challenge_id": str(challenge.id), "masked_email": security_status(user)["masked_email"],
            "expires_in": 300, "resend_after": 60, "is_transfer": transfer}


def issue_token(user):
    # Caller locks this user when security is enabled, serializing concurrent logins.
    if enabled_for(user):
        AuthToken.objects.filter(user=user).delete()
    Token.objects.filter(user=user).delete()
    return AuthToken.objects.create(user=user)[1]


def verify_challenge(challenge_id, code, browser_key):
    browser_hash = browser_digest(browser_key)
    try:
        challenge_id = uuid.UUID(str(challenge_id))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError("This code request is invalid. Sign in again.")
    owner = EmailSignInChallenge.objects.filter(pk=challenge_id).values_list("user_id", flat=True).first()
    if not owner:
        raise ValidationError("This code request is invalid. Sign in again.")
    error = None
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=owner)
        challenge = EmailSignInChallenge.objects.select_for_update().get(pk=challenge_id)
        now = timezone.now()
        if not enabled_for(user) or not user.is_active or challenge.consumed_at or challenge.expires_at <= now or challenge.attempts >= 5:
            error = "This code has expired or is no longer available. Request a new code."
        elif challenge.email != user.email or not constant_time_compare(challenge.password_fingerprint, digest(user.password, "password")):
            error = "Your account details changed. Sign in again to request a new code."
        else:
            challenge.attempts += 1
            valid_code = isinstance(code, str) and len(code) == 6 and code.isascii() and code.isdigit()
            if not valid_code or not constant_time_compare(challenge.code_hash, digest(f"{challenge.id}:{code}", "otp")) or not constant_time_compare(challenge.browser_hash, browser_hash):
                error = "That code is incorrect. Check the latest email and try again."
                challenge.save(update_fields=("attempts",))
            else:
                # Recheck under the same user lock: another challenge may have transferred meanwhile.
                transfer = bool(user.trusted_browser_hash and not constant_time_compare(user.trusted_browser_hash, browser_hash))
                if transfer:
                    check_transfer_limit(user)
                user.email_verified_at = user.email_verified_at or now
                user.trusted_browser_hash = browser_hash
                user.save(update_fields=("email_verified_at", "trusted_browser_hash"))
                challenge.is_transfer = transfer
                challenge.accepted_at = challenge.consumed_at = now
                challenge.save(update_fields=("attempts", "is_transfer", "accepted_at", "consumed_at"))
                EmailSignInChallenge.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=now)
                token = issue_token(user)
    if error:
        raise ValidationError({"detail": error})
    return user, token
