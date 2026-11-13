"""Shared policy helpers for the university limited-access period and paid access."""

from datetime import timedelta

from django.utils import timezone


DEFAULT_LIMITED_ACCESS_DAYS = 14
PREVIEW_ACCESS_PERCENT = 20
ONGOING_SAMPLE_PERCENT = 5
DEFAULT_ALL_ACCESS_PRICE = 3000
DEFAULT_SINGLE_COURSE_PRICE = 1500


def limited_access_duration_days():
    """Return the monitor-managed preview length, safely defaulting to 14 days."""
    from .models import PlanConfig

    return PlanConfig.objects.filter(pk=1).values_list("limited_access_days", flat=True).first() or DEFAULT_LIMITED_ACCESS_DAYS


def is_university_user(user):
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "user_type", "") == "university" or getattr(user, "active_mode", "") == "university":
        return True
    try:
        return bool(user.university_profile)
    except Exception:
        return False


def limited_access_end(user, days=None):
    created_at = getattr(user, "created_at", None) or getattr(user, "date_joined", None)
    if not created_at:
        return None
    return created_at + timedelta(days=limited_access_duration_days() if days is None else days)


def limited_access_is_applicable(user):
    created_at = getattr(user, "created_at", None) or getattr(user, "date_joined", None)
    return is_university_user(user) and created_at is not None


def limited_access_is_in_preview(user, now=None, end=None):
    if not is_university_user(user):
        return False
    now = now or timezone.now()
    end = end or limited_access_end(user)
    return bool(end and now < end)


def limited_access_percentage(user, now=None, end=None):
    """Return 20% during the registration preview, then a persistent 5% sample."""
    if not is_university_user(user):
        return 0
    return PREVIEW_ACCESS_PERCENT if limited_access_is_in_preview(user, now=now, end=end) else ONGOING_SAMPLE_PERCENT


def limited_access_is_active(user, now=None, end=None):
    """Whether a university account has any non-paid question/note sample."""
    return limited_access_percentage(user, now=now, end=end) > 0


def has_paid_university_access(user, course_code=None, now=None):
    """Whether an account has active paid or staff-granted access to the course."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return True
    if not is_university_user(user):
        return False

    from .models import CourseAccess

    return CourseAccess.user_has_course_access(user, course_code)


def has_full_university_access(user, now=None):
    """True for an active all-course payment or staff-granted pass."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return True
    if not is_university_user(user):
        return False

    from .models import CourseAccess

    now = now or timezone.now()
    return CourseAccess.objects.filter(
        user=user,
        access_type=CourseAccess.AccessType.ALL_ACCESS,
        is_active=True,
        granted_by__in=(CourseAccess.GrantedBy.PAYMENT, CourseAccess.GrantedBy.ADMIN_MANUAL),
        starts_at__lte=now,
        expires_at__gte=now,
    ).exists()
