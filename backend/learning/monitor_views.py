import csv
import json
import secrets
import string
import uuid
from datetime import datetime, timedelta

from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db import models, transaction
from django.db.models import Avg, Count, Prefetch, Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods, require_POST
from rest_framework.authtoken.models import Token

from monetization.models import (
    CourseAccess,
    CourseTopicConfig,
    DiscountCode,
    MonetizationEvent,
    PaymentTransaction,
    PlanConfig,
)
from .analytics import session_analytics, user_test_analytics
from .models import (
    ActivityEvent,
    Attempt,
    PracticeSession,
    Question,
    QuestionReport,
    Subject,
    Topic,
    UserStats,
)

User = get_user_model()


def percentage(correct, total):
    return round(correct / total * 100) if total else 0


def csv_safe(value):
    text = str(value or "")
    return f"'{text}" if text.startswith(("=", "+", "-", "@")) else text


def temporary_password():
    required = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%&*?"),
    ]
    characters = required + [
        secrets.choice(string.ascii_letters + string.digits + "!@#$%&*?") for _ in range(10)
    ]
    secrets.SystemRandom().shuffle(characters)
    return "".join(characters)


# ─── Auth Views ─────────────────────────────────────────────────────────────

@require_http_methods(["GET", "POST"])
def monitor_login(request):
    if request.user.is_authenticated and request.user.is_staff:
        return redirect("monitor:dashboard")
    error = ""
    if request.method == "POST":
        email = request.POST.get("email", "").lower().strip()
        user = authenticate(request, email=email, password=request.POST.get("password", ""))
        if user and user.is_active and user.is_staff:
            login(request, user)
            return redirect("monitor:dashboard")
        error = "The email or password is incorrect, or this account is not an administrator."
    return render(request, "monitor/login.html", {"error": error})


@require_POST
def monitor_logout(request):
    logout(request)
    return redirect("monitor:login")


# ─── Dashboard Overview ─────────────────────────────────────────────────────

@staff_member_required
def dashboard(request):
    range_param = request.GET.get("range", "7d").lower().strip()
    track_param = request.GET.get("track", "all").lower().strip()
    if track_param not in {"all", "aspirant", "university"}:
        track_param = "all"
    now = timezone.now()
    today_date = timezone.localdate()

    if range_param == "today":
        start_date = timezone.make_aware(datetime.combine(today_date, datetime.min.time()))
        range_label = "Today"
    elif range_param == "30d":
        start_date = now - timedelta(days=30)
        range_label = "Last 30 Days"
    elif range_param == "all":
        start_date = None
        range_label = "All Time"
    else:
        # Default 7d
        range_param = "7d"
        start_date = now - timedelta(days=7)
        range_label = "Last 7 Days"

    # Base QuerySets & Track Demarcation Counters
    student_filter = Q(is_staff=False)
    total_students_all = User.objects.filter(student_filter).count()
    aspirant_students_count = User.objects.filter(student_filter, active_mode="aspirant").count()
    university_students_count = User.objects.filter(student_filter, active_mode="university").count()

    total_tests_all = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED).count()
    aspirant_tests_all = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED, track="aspirant").count()
    university_tests_all = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED, track="university").count()

    sessions_qs = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED)
    attempts_qs = Attempt.objects.all()
    events_qs = ActivityEvent.objects.filter(user__is_staff=False)
    users_qs = User.objects.filter(student_filter)
    tx_qs = PaymentTransaction.objects.filter(status=PaymentTransaction.Status.SUCCESS)

    if track_param == "aspirant":
        sessions_qs = sessions_qs.filter(track="aspirant")
        users_qs = users_qs.filter(active_mode="aspirant")
    elif track_param == "university":
        sessions_qs = sessions_qs.filter(track="university")
        users_qs = users_qs.filter(active_mode="university")

    if start_date:
        sessions_qs = sessions_qs.filter(completed_at__gte=start_date)
        attempts_qs = attempts_qs.filter(answered_at__gte=start_date)
        events_qs = events_qs.filter(created_at__gte=start_date)
        period_new_students = users_qs.filter(date_joined__gte=start_date).count()
        period_revenue = tx_qs.filter(paid_at__gte=start_date).aggregate(s=Sum("amount"))["s"] or 0
    else:
        period_new_students = users_qs.count()
        period_revenue = tx_qs.aggregate(s=Sum("amount"))["s"] or 0

    all_time_revenue = tx_qs.aggregate(s=Sum("amount"))["s"] or 0

    period_tests = sessions_qs.count()
    aspirant_tests_period = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED, track="aspirant", completed_at__gte=start_date if start_date else datetime.min).count() if start_date else aspirant_tests_all
    university_tests_period = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED, track="university", completed_at__gte=start_date if start_date else datetime.min).count() if start_date else university_tests_all

    # Active students: users with attempts or completed sessions
    session_user_ids = set(sessions_qs.values_list("user_id", flat=True))
    attempt_user_ids = set(attempts_qs.values_list("user_id", flat=True)) if track_param != "university" else set()
    period_active_students = len(session_user_ids.union(attempt_user_ids))

    # Calculate attempts and accuracy across both tracks
    if track_param == "university":
        uni_q_total = sessions_qs.aggregate(s=Sum("total_questions"))["s"] or 0
        uni_q_correct = sessions_qs.aggregate(s=Sum("correct_answers"))["s"] or 0
        period_attempts = uni_q_total
        period_correct = uni_q_correct
    elif track_param == "aspirant":
        period_attempts = attempts_qs.count()
        period_correct = attempts_qs.filter(is_correct=True).count()
    else:
        uni_in_period = sessions_qs.filter(track="university")
        uni_q_total = uni_in_period.aggregate(s=Sum("total_questions"))["s"] or 0
        uni_q_correct = uni_in_period.aggregate(s=Sum("correct_answers"))["s"] or 0
        period_attempts = attempts_qs.count() + uni_q_total
        period_correct = attempts_qs.filter(is_correct=True).count() + uni_q_correct

    period_accuracy = percentage(period_correct, period_attempts)

    # Average score in period
    completed_rows = list(sessions_qs.only("correct_answers", "total_questions"))
    scores = [percentage(s.correct_answers, s.total_questions) for s in completed_rows if s.total_questions > 0]
    period_avg_score = round(sum(scores) / len(scores)) if scores else 0

    # ── Chart 1: Daily Activity Trend (Past 7 or 14 days) ───────────────────
    chart_days = 14 if range_param in {"30d", "all"} else 7
    activity_labels = []
    activity_data = []
    for i in range(chart_days - 1, -1, -1):
        day = today_date - timedelta(days=i)
        day_count = PracticeSession.objects.filter(
            status=PracticeSession.Status.COMPLETED,
            completed_at__date=day
        ).count()
        activity_labels.append(day.strftime("%d %b"))
        activity_data.append(day_count)

    # ── Chart 2: Test Mode Breakdown (Doughnut) ─────────────────────────────
    mode_counts = {
        "Timed Practice": sessions_qs.filter(mode=PracticeSession.Mode.TIMED).count(),
        "Normal Practice": sessions_qs.filter(mode=PracticeSession.Mode.NORMAL).count(),
        "Daily Sprint": sessions_qs.filter(mode=PracticeSession.Mode.DAILY).count(),
        "Friend Challenges": sessions_qs.filter(mode=PracticeSession.Mode.CHALLENGE).count(),
    }
    mode_labels = list(mode_counts.keys())
    mode_data = list(mode_counts.values())

    # ── Chart 3 & Catalog: Dual-Track Subject & Course Performance ────────
    # 1. Aspirant Subjects (JAMB / WAEC)
    aspirant_subjects = list(Subject.objects.filter(is_active=True, track="aspirant").annotate(
        total_attempts=Count("topics__questions__attempts", distinct=True),
        correct_attempts=Count("topics__questions__attempts", filter=Q(topics__questions__attempts__is_correct=True), distinct=True),
        student_count=Count("topics__questions__attempts__user", distinct=True),
        test_count=Count("practice_sessions", filter=Q(practice_sessions__status=PracticeSession.Status.COMPLETED), distinct=True),
        question_count=Count("topics__questions", filter=Q(topics__questions__is_active=True), distinct=True),
        reviewed_count=Count("topics__questions", filter=Q(topics__questions__is_active=True, topics__questions__explanation_status=Question.ExplanationStatus.REVIEWED), distinct=True),
    ))
    for subject in aspirant_subjects:
        subject.accuracy = percentage(subject.correct_attempts, subject.total_attempts)
        subject.explanation_coverage = percentage(subject.reviewed_count, subject.question_count)

    # 2. University Medical Courses (ANA 201, ANA 203, PIO 201)
    university_subjects = list(Subject.objects.filter(is_active=True, track="university"))
    for subject in university_subjects:
        code = subject.code or subject.name[:7].strip()
        uni_sess = PracticeSession.objects.filter(
            Q(subject=subject) | Q(course_code__iexact=code),
            status=PracticeSession.Status.COMPLETED
        )
        subject.test_count = uni_sess.count()
        subject.student_count = uni_sess.values("user_id").distinct().count()
        tot_q = uni_sess.aggregate(s=Sum("total_questions"))["s"] or 0
        cor_q = uni_sess.aggregate(s=Sum("correct_answers"))["s"] or 0
        subject.total_attempts = tot_q
        subject.correct_attempts = cor_q
        subject.accuracy = percentage(cor_q, tot_q)
        subject.question_count = 100
        subject.explanation_coverage = 100

    if track_param == "aspirant":
        display_subjects = aspirant_subjects
    elif track_param == "university":
        display_subjects = university_subjects
    else:
        display_subjects = university_subjects + aspirant_subjects

    sorted_subjects = sorted(display_subjects, key=lambda s: getattr(s, "total_attempts", 0), reverse=True)[:8]
    subject_chart_labels = [getattr(s, "code", "") or s.name for s in sorted_subjects]
    subject_chart_accuracy = [s.accuracy for s in sorted_subjects]
    subject_chart_attempts = [getattr(s, "total_attempts", 0) for s in sorted_subjects]

    # ── Chart 4: Monetization / Access Tier Breakdown ───────────────────────
    now_dt = timezone.now()
    active_grants = CourseAccess.objects.filter(is_active=True, expires_at__gte=now_dt)
    all_access_count = active_grants.filter(access_type=CourseAccess.AccessType.ALL_ACCESS).values("user_id").distinct().count()
    trial_count = active_grants.filter(access_type=CourseAccess.AccessType.TRIAL).values("user_id").distinct().count()
    single_course_count = active_grants.filter(access_type=CourseAccess.AccessType.SINGLE_COURSE).values("user_id").distinct().count()
    free_users_count = max(0, total_students_all - (all_access_count + trial_count + single_course_count))

    tier_labels = ["Free Accounts", "3-Day Trial Active", "Single Course Pass", "All-Access Pass"]
    tier_data = [free_users_count, trial_count, single_course_count, all_access_count]

    # ── Curbed Recent Events ────────────────────────────────────────────────
    # Return 6 for the immediate clean card, plus 40 for the expandable modal
    recent_events_curbed = ActivityEvent.objects.select_related("user").filter(user__is_staff=False).order_by("-created_at")[:6]
    recent_events_all = ActivityEvent.objects.select_related("user").filter(user__is_staff=False).order_by("-created_at")[:40]

    # Map icons to event types
    for ev in list(recent_events_curbed) + list(recent_events_all):
        et = ev.event_type.lower()
        if "sign_in" in et or "signed_in" in et:
            ev.icon_class = "login"
            ev.icon_char = "🔑"
        elif "register" in et:
            ev.icon_class = "register"
            ev.icon_char = "✨"
        elif "session" in et or "test" in et:
            ev.icon_class = "test"
            ev.icon_char = "📝"
        elif "pay" in et or "trial" in et or "sub" in et:
            ev.icon_class = "payment"
            ev.icon_char = "💳"
        else:
            ev.icon_class = "other"
            ev.icon_char = "📌"

    recent_students = User.objects.filter(student_filter).select_related("learning_stats", "aspirant_profile", "university_profile").order_by("-date_joined")[:7]

    context = {
        "range_param": range_param,
        "range_label": range_label,
        "total_students_all": total_students_all,
        "total_tests_all": total_tests_all,
        "period_tests": period_tests,
        "period_avg_score": period_avg_score,
        "period_active_students": period_active_students,
        "period_attempts": period_attempts,
        "period_accuracy": period_accuracy,
        "period_new_students": period_new_students,
        "period_revenue": period_revenue,
        "all_time_revenue": all_time_revenue,
        "track_param": track_param,
        "aspirant_students_count": aspirant_students_count,
        "university_students_count": university_students_count,
        "aspirant_tests_all": aspirant_tests_all,
        "university_tests_all": university_tests_all,
        "aspirant_tests_period": aspirant_tests_period,
        "university_tests_period": university_tests_period,
        "subjects": display_subjects,
        "aspirant_subjects": aspirant_subjects,
        "university_subjects": university_subjects,
        "recent_students": recent_students,
        "recent_events_curbed": recent_events_curbed,
        "recent_events_all": recent_events_all,
        # JSON-serialized chart payloads
        "chart_activity_labels": json.dumps(activity_labels),
        "chart_activity_data": json.dumps(activity_data),
        "chart_mode_labels": json.dumps(mode_labels),
        "chart_mode_data": json.dumps(mode_data),
        "chart_subject_labels": json.dumps(subject_chart_labels),
        "chart_subject_accuracy": json.dumps(subject_chart_accuracy),
        "chart_subject_attempts": json.dumps(subject_chart_attempts),
        "chart_tier_labels": json.dumps(tier_labels),
        "chart_tier_data": json.dumps(tier_data),
    }
    return render(request, "monitor/dashboard.html", context)


# ─── University Track Command Center ─────────────────────────────────────────

@staff_member_required
def university_dashboard(request):
    range_param = request.GET.get("range", "all").lower().strip()
    query = request.GET.get("q", "").strip()
    now = timezone.now()
    today_date = timezone.localdate()

    if range_param == "today":
        start_date = timezone.make_aware(datetime.combine(today_date, datetime.min.time()))
        range_label = "Today"
    elif range_param == "7d":
        start_date = now - timedelta(days=7)
        range_label = "Last 7 Days"
    elif range_param == "30d":
        start_date = now - timedelta(days=30)
        range_label = "Last 30 Days"
    else:
        range_param = "all"
        start_date = None
        range_label = "All Time"

    # Base university sessions
    uni_sessions_all = PracticeSession.objects.filter(track="university", status=PracticeSession.Status.COMPLETED)
    uni_sessions = uni_sessions_all
    if start_date:
        uni_sessions = uni_sessions.filter(completed_at__gte=start_date)

    # University students
    uni_student_ids = set(uni_sessions_all.values_list("user_id", flat=True))
    uni_users_qs = User.objects.filter(
        Q(active_mode="university") | Q(user_type="university") | Q(id__in=uni_student_ids),
        is_staff=False
    ).distinct()

    total_uni_students = uni_users_qs.count()
    total_uni_tests_all = uni_sessions_all.count()
    period_uni_tests = uni_sessions.count()

    tot_q = uni_sessions.aggregate(s=Sum("total_questions"))["s"] or 0
    cor_q = uni_sessions.aggregate(s=Sum("correct_answers"))["s"] or 0
    period_accuracy = percentage(cor_q, tot_q)

    # Average score
    completed_rows = list(uni_sessions.only("correct_answers", "total_questions"))
    scores = [percentage(s.correct_answers, s.total_questions) for s in completed_rows if s.total_questions > 0]
    period_avg_score = round(sum(scores) / len(scores)) if scores else 0

    # Active students in period
    period_active_students = uni_sessions.values("user_id").distinct().count()

    # Access tier counts for university students
    now_dt = timezone.now()
    active_grants = CourseAccess.objects.filter(user__in=uni_users_qs, is_active=True, expires_at__gte=now_dt)
    all_access_count = active_grants.filter(access_type=CourseAccess.AccessType.ALL_ACCESS).values("user_id").distinct().count()
    trial_count = active_grants.filter(access_type=CourseAccess.AccessType.TRIAL).values("user_id").distinct().count()
    single_count = active_grants.filter(access_type=CourseAccess.AccessType.SINGLE_COURSE).values("user_id").distinct().count()
    free_count = max(0, total_uni_students - (all_access_count + trial_count + single_count))

    # University Medical Courses breakdown
    courses = [
        {"code": "ANA 201", "name": "Gross Anatomy: Upper & Lower Limb", "topics_count": 5, "slug": "ana-201", "color": "#059669"},
        {"code": "ANA 203", "name": "General & Systemic Embryology", "topics_count": 6, "slug": "ana-203", "color": "#0d9488"},
        {"code": "PIO 201", "name": "Physiology and Blood", "topics_count": 4, "slug": "pio-201", "color": "#d97706"},
    ]
    for c in courses:
        c_sess = uni_sessions.filter(Q(course_code__iexact=c["code"]) | Q(subject__code__iexact=c["code"]))
        c["tests_count"] = c_sess.count()
        c["students_count"] = c_sess.values("user_id").distinct().count()
        c_tot = c_sess.aggregate(s=Sum("total_questions"))["s"] or 0
        c_cor = c_sess.aggregate(s=Sum("correct_answers"))["s"] or 0
        c["accuracy"] = percentage(c_cor, c_tot)
        c_scores = [percentage(s.correct_answers, s.total_questions) for s in c_sess if s.total_questions > 0]
        c["avg_score"] = round(sum(c_scores) / len(c_scores)) if c_scores else 0
        pass_count = sum(1 for sc in c_scores if sc >= 50)
        c["pass_rate"] = percentage(pass_count, len(c_scores)) if c_scores else 0

    # Student list with university metrics
    student_rows = uni_users_qs.select_related(
        "learning_stats", "university_profile"
    ).prefetch_related(
        Prefetch("practice_sessions", queryset=uni_sessions_all, to_attr="uni_test_rows"),
        "course_accesses"
    ).order_by("-date_joined")

    if query:
        student_rows = student_rows.filter(
            Q(public_id__iexact=query) | Q(username__icontains=query) | Q(email__icontains=query) |
            Q(university_profile__institution__icontains=query)
        )

    student_list = []
    for user in student_rows[:120]:
        u_tests = user.uni_test_rows
        u_scores = [percentage(item.correct_answers, item.total_questions) for item in u_tests if item.total_questions > 0]
        user.uni_test_count = len(u_tests)
        user.uni_avg_score = round(sum(u_scores) / len(u_scores)) if u_scores else 0
        u_tot = sum(item.total_questions for item in u_tests)
        u_cor = sum(item.correct_answers for item in u_tests)
        user.uni_accuracy = percentage(u_cor, u_tot)

        # Check access badge
        active_grant = user.course_accesses.filter(is_active=True, expires_at__gte=now_dt).first()
        if active_grant:
            if active_grant.access_type == CourseAccess.AccessType.TRIAL:
                user.access_badge = "3-Day Trial"
                user.access_badge_class = "badge-trial"
            elif active_grant.access_type == CourseAccess.AccessType.ALL_ACCESS:
                user.access_badge = "All-Access Pass"
                user.access_badge_class = "badge-all-access"
            else:
                user.access_badge = f"{active_grant.course_code} Pass"
                user.access_badge_class = "badge-single"
        else:
            user.access_badge = "Free"
            user.access_badge_class = "badge-free"

        student_list.append(user)

    # Recent University Sessions Log (latest 25)
    recent_sessions = list(uni_sessions_all.select_related("user").order_by("-completed_at")[:25])
    for sess in recent_sessions:
        dur = sess.time_spent_seconds or ((sess.duration_minutes or 0) * 60)
        sess.formatted_duration = f"{dur // 60}m {dur % 60}s" if dur >= 60 else f"{dur}s"
        score = percentage(sess.correct_answers, sess.total_questions)
        sess.score_pct = score
        sess.passed = score >= 50

    context = {
        "range_param": range_param,
        "range_label": range_label,
        "query": query,
        "total_uni_students": total_uni_students,
        "total_uni_tests_all": total_uni_tests_all,
        "period_uni_tests": period_uni_tests,
        "period_accuracy": period_accuracy,
        "period_avg_score": period_avg_score,
        "period_active_students": period_active_students,
        "all_access_count": all_access_count,
        "trial_count": trial_count,
        "single_count": single_count,
        "free_count": free_count,
        "courses": courses,
        "student_list": student_list,
        "recent_sessions": recent_sessions,
    }
    return render(request, "monitor/university.html", context)


# ─── Students Directory ─────────────────────────────────────────────────────

@staff_member_required
def students(request):
    query = request.GET.get("q", "").strip()
    mode_filter = request.GET.get("mode", "").strip().lower()

    completed_tests = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED).only(
        "user_id", "total_questions", "correct_answers", "completed_at"
    )

    users = User.objects.filter(is_staff=False).select_related(
        "learning_stats", "aspirant_profile", "university_profile"
    ).prefetch_related(
        Prefetch("practice_sessions", queryset=completed_tests, to_attr="completed_test_rows"),
        "course_accesses"
    ).annotate(
        attempt_count=Count("attempts", distinct=True),
        correct_count=Count("attempts", filter=Q(attempts__is_correct=True), distinct=True)
    ).order_by("-date_joined")

    if query:
        users = users.filter(
            Q(public_id__iexact=query) | Q(username__icontains=query) | Q(email__icontains=query)
        )

    if mode_filter == "aspirant":
        users = users.filter(active_mode="aspirant")
    elif mode_filter == "university":
        users = users.filter(active_mode="university")

    now_dt = timezone.now()
    user_list = []
    for user in users[:250]:
        scores = [percentage(item.correct_answers, item.total_questions) for item in user.completed_test_rows]
        user.test_count = len(scores)
        user.average_test_score = round(sum(scores) / len(scores)) if scores else 0
        tot_q = sum(item.total_questions for item in user.completed_test_rows)
        cor_q = sum(item.correct_answers for item in user.completed_test_rows)
        if tot_q > 0:
            user.accuracy = percentage(cor_q, tot_q)
        else:
            user.accuracy = percentage(user.correct_count, user.attempt_count)

        # Check access badge
        active_grant = user.course_accesses.filter(is_active=True, expires_at__gte=now_dt).first()
        if active_grant:
            if active_grant.access_type == CourseAccess.AccessType.TRIAL:
                user.access_badge = "Trial"
                user.access_badge_class = "badge-trial"
            elif active_grant.access_type == CourseAccess.AccessType.ALL_ACCESS:
                user.access_badge = "All-Access"
                user.access_badge_class = "badge-all-access"
            else:
                user.access_badge = active_grant.course_code
                user.access_badge_class = "badge-single"
        else:
            user.access_badge = "Free"
            user.access_badge_class = "badge-free"

        user_list.append(user)

    return render(request, "monitor/students.html", {
        "students": user_list,
        "query": query,
        "mode_filter": mode_filter,
        "total_count": users.count() if not query and not mode_filter else len(user_list),
    })


# ─── Student Detail View ────────────────────────────────────────────────────

@staff_member_required
def student_detail(request, public_id):
    student = get_object_or_404(
        User.objects.select_related("learning_stats", "aspirant_profile", "university_profile"),
        public_id=public_id,
        is_staff=False
    )

    attempts = student.attempts.select_related("question__topic__subject").order_by("-answered_at")
    total = attempts.count()
    correct = attempts.filter(is_correct=True).count()
    wrong = max(0, total - correct)
    student_accuracy = percentage(correct, total)

    subject_rows = attempts.values(
        "question__topic__subject__name", "question__topic__subject__slug"
    ).annotate(
        total=Count("id"),
        correct=Count("id", filter=Q(is_correct=True))
    ).order_by("question__topic__subject__position")

    for row in subject_rows:
        row["accuracy"] = percentage(row["correct"], row["total"])

    topic_rows = attempts.values(
        "question__topic__name", "question__topic__subject__name"
    ).annotate(
        total=Count("id"),
        correct=Count("id", filter=Q(is_correct=True))
    ).order_by("correct", "-total")[:12]

    for row in topic_rows:
        row["accuracy"] = percentage(row["correct"], row["total"])

    tests = user_test_analytics(student, include_recent=True)

    # Completed sessions split by track
    completed_sessions = list(student.practice_sessions.filter(status=PracticeSession.Status.COMPLETED).order_by("-completed_at"))
    uni_sessions = [s for s in completed_sessions if s.track == "university"]
    asp_sessions = [s for s in completed_sessions if s.track != "university"]

    uni_courses_summary = {}
    for s in uni_sessions:
        code = s.course_code or "ANA 201"
        if code not in uni_courses_summary:
            uni_courses_summary[code] = {"code": code, "tests": 0, "total_q": 0, "correct_q": 0, "topics": set()}
        uni_courses_summary[code]["tests"] += 1
        uni_courses_summary[code]["total_q"] += s.total_questions
        uni_courses_summary[code]["correct_q"] += s.correct_answers
        if s.topic_title:
            uni_courses_summary[code]["topics"].add(s.topic_title)

    for item in uni_courses_summary.values():
        item["accuracy"] = percentage(item["correct_q"], item["total_q"])
        item["topics_count"] = len(item["topics"])

    uni_courses_list = list(uni_courses_summary.values())

    # Overall accuracy combining both tracks
    uni_tot_q = sum(s.total_questions for s in uni_sessions)
    uni_cor_q = sum(s.correct_answers for s in uni_sessions)
    comb_total = total + uni_tot_q
    comb_correct = correct + uni_cor_q
    if comb_total > 0:
        student_accuracy = percentage(comb_correct, comb_total)

    # Access summary & active grants
    access_summary = CourseAccess.get_user_access_summary(student)
    all_grants = student.course_accesses.all().order_by("-created_at")

    # Payment transactions for this student
    transactions = PaymentTransaction.objects.filter(user=student).order_by("-created_at")[:10]

    # Student Charts Data
    subject_chart_labels = [row["question__topic__subject__name"] for row in subject_rows[:8]]
    subject_chart_accuracy = [row["accuracy"] for row in subject_rows[:8]]

    recent_test_scores = []
    recent_test_labels = []
    for idx, t in enumerate(reversed(tests.get("recent_tests", [])[:10])):
        recent_test_scores.append(t["score"])
        recent_test_labels.append(f"Test #{idx + 1}")

    chart_pie_labels = ["Correct Answers", "Incorrect Answers"]
    chart_pie_data = [correct, wrong]

    plan_config = PlanConfig.get_solo()

    context = {
        "student": student,
        "total": total,
        "correct": correct,
        "wrong": wrong,
        "accuracy": student_accuracy,
        "tests": tests,
        "uni_courses_list": uni_courses_list,
        "uni_sessions": uni_sessions,
        "asp_sessions": asp_sessions,
        "subject_rows": subject_rows,
        "topic_rows": topic_rows,
        "recent_attempts": attempts[:15],
        "recent_events": student.activity_events.all().order_by("-created_at")[:15],
        "access_summary": access_summary,
        "all_grants": all_grants,
        "transactions": transactions,
        "plan_config": plan_config,
        # JSON chart data
        "chart_subject_labels": json.dumps(subject_chart_labels),
        "chart_subject_accuracy": json.dumps(subject_chart_accuracy),
        "chart_test_labels": json.dumps(recent_test_labels),
        "chart_test_scores": json.dumps(recent_test_scores),
        "chart_pie_labels": json.dumps(chart_pie_labels),
        "chart_pie_data": json.dumps(chart_pie_data),
    }
    return render(request, "monitor/student_detail.html", context)


# ─── Student Access Management Actions ──────────────────────────────────────

@staff_member_required
@require_POST
def grant_student_access(request, public_id):
    student = get_object_or_404(User, public_id=public_id, is_staff=False)
    plan_config = PlanConfig.get_solo()

    access_type = request.POST.get("access_type", "all_access").strip()
    course_code = request.POST.get("course_code", "all").strip().upper()
    expires_str = request.POST.get("expires_at", "").strip()

    if expires_str:
        try:
            expires_at = timezone.make_aware(datetime.strptime(expires_str, "%Y-%m-%d"))
        except Exception:
            expires_at = plan_config.semester_end_date
    else:
        expires_at = plan_config.semester_end_date

    CourseAccess.objects.create(
        user=student,
        access_type=access_type,
        course_code=course_code if access_type == "single_course" else "all",
        starts_at=timezone.now(),
        expires_at=expires_at,
        is_active=True,
        granted_by=CourseAccess.GrantedBy.ADMIN_MANUAL,
        reference=f"manual_{request.user.username}_{int(timezone.now().timestamp())}",
    )

    MonetizationEvent.objects.create(
        user=student,
        event_name="manual_access_granted",
        metadata={
            "granted_by": request.user.username,
            "access_type": access_type,
            "course_code": course_code,
            "expires_at": expires_at.isoformat(),
        }
    )

    messages.success(request, f"Successfully granted {access_type.upper()} ({course_code}) access to {student.username} until {expires_at.strftime('%Y-%m-%d')}.")
    return redirect("monitor:student-detail", public_id=student.public_id)


@staff_member_required
@require_POST
def revoke_student_access(request, public_id):
    student = get_object_or_404(User, public_id=public_id, is_staff=False)
    access_id = request.POST.get("access_id")

    if access_id:
        grant = CourseAccess.objects.filter(id=access_id, user=student).first()
        if grant:
            grant.is_active = False
            grant.save(update_fields=["is_active"])
    else:
        # Revoke all active
        CourseAccess.objects.filter(user=student, is_active=True).update(is_active=False)

    messages.warning(request, f"Course access revoked for {student.username}.")
    return redirect("monitor:student-detail", public_id=student.public_id)


# ─── Monetization & Access Hub ──────────────────────────────────────────────

@staff_member_required
def monetization_hub(request):
    plan_config = PlanConfig.get_solo()
    discount_codes = DiscountCode.objects.all().order_by("-created_at")

    now_dt = timezone.now()
    active_grants_qs = CourseAccess.objects.filter(is_active=True, expires_at__gte=now_dt)
    active_grants = active_grants_qs.select_related("user").order_by("-created_at")[:40]
    recent_transactions = PaymentTransaction.objects.select_related("user", "discount_code").all().order_by("-created_at")[:30]

    # Stats
    total_revenue = PaymentTransaction.objects.filter(status=PaymentTransaction.Status.SUCCESS).aggregate(s=Sum("amount"))["s"] or 0
    all_access_active = active_grants_qs.filter(access_type=CourseAccess.AccessType.ALL_ACCESS).count()
    trial_active = active_grants_qs.filter(access_type=CourseAccess.AccessType.TRIAL).count()
    single_active = active_grants_qs.filter(access_type=CourseAccess.AccessType.SINGLE_COURSE).count()

    free_topics = CourseTopicConfig.objects.all()

    context = {
        "plan_config": plan_config,
        "discount_codes": discount_codes,
        "active_grants": active_grants,
        "recent_transactions": recent_transactions,
        "total_revenue": total_revenue,
        "all_access_active": all_access_active,
        "trial_active": trial_active,
        "single_active": single_active,
        "free_topics": free_topics,
    }
    return render(request, "monitor/monetization.html", context)


@staff_member_required
@require_POST
def update_pricing(request):
    config = PlanConfig.get_solo()
    try:
        config.single_course_price = int(request.POST.get("single_course_price", config.single_course_price))
        config.all_access_price = int(request.POST.get("all_access_price", config.all_access_price))
        config.launch_offer_price = int(request.POST.get("launch_offer_price", config.launch_offer_price))
        config.launch_offer_active = request.POST.get("launch_offer_active") == "on"
        config.screenshot_protection_enabled = request.POST.get("screenshot_protection_enabled") == "on"
        config.launch_offer_max_buyers = int(request.POST.get("launch_offer_max_buyers", config.launch_offer_max_buyers))
        config.trial_duration_days = int(request.POST.get("trial_duration_days", config.trial_duration_days))

        launch_end_str = request.POST.get("launch_offer_end_date", "").strip()
        if launch_end_str:
            config.launch_offer_end_date = timezone.make_aware(datetime.strptime(launch_end_str, "%Y-%m-%d"))

        semester_end_str = request.POST.get("semester_end_date", "").strip()
        if semester_end_str:
            config.semester_end_date = timezone.make_aware(datetime.strptime(semester_end_str, "%Y-%m-%d"))

        pk = request.POST.get("paystack_public_key", "").strip()
        sk = request.POST.get("paystack_secret_key", "").strip()
        if pk:
            config.paystack_public_key = pk
        if sk and not sk.startswith("••••"):
            config.paystack_secret_key = sk

        config.save()
        messages.success(request, "Monetization prices and semester settings updated successfully.")
    except Exception as e:
        messages.error(request, f"Error saving pricing settings: {e}")

    return redirect("monitor:monetization")


@staff_member_required
@require_POST
def toggle_screenshot_protection(request):
    config = PlanConfig.get_solo()
    config.screenshot_protection_enabled = not config.screenshot_protection_enabled
    config.save(update_fields=["screenshot_protection_enabled"])
    if config.screenshot_protection_enabled:
        messages.success(request, "Screenshot & content protection is now ENABLED. Student content and exam integrity are protected.")
    else:
        messages.warning(request, "Screenshot protection is now DISABLED. You can now freely take app screenshots.")
    return redirect("monitor:monetization")


@staff_member_required
@require_POST
def create_discount_code(request):
    code = request.POST.get("code", "").strip().upper()
    label = request.POST.get("label", "").strip()
    price = request.POST.get("discounted_price", "").strip()
    target_plan = request.POST.get("target_plan", "all_access").strip()
    max_uses_str = request.POST.get("max_uses", "").strip()
    expires_str = request.POST.get("expires_at", "").strip()

    if not code or not price:
        messages.error(request, "Code and discounted price are required.")
        return redirect("monitor:monetization")

    try:
        max_uses = int(max_uses_str) if max_uses_str else None
        expires_at = timezone.make_aware(datetime.strptime(expires_str, "%Y-%m-%d")) if expires_str else None

        DiscountCode.objects.create(
            code=code,
            label=label or code,
            discounted_price=int(price),
            target_plan=target_plan,
            max_uses=max_uses,
            expires_at=expires_at,
            is_active=True,
        )
        messages.success(request, f"Discount / class code '{code}' created successfully!")
    except Exception as e:
        messages.error(request, f"Error creating code: {e}")

    return redirect("monitor:monetization")


@staff_member_required
@require_POST
def toggle_discount_code(request, discount_id):
    discount = get_object_or_404(DiscountCode, id=discount_id)
    discount.is_active = not discount.is_active
    discount.save(update_fields=["is_active"])
    status_str = "activated" if discount.is_active else "disabled"
    messages.success(request, f"Code '{discount.code}' has been {status_str}.")
    return redirect("monitor:monetization")


@staff_member_required
@require_POST
def delete_discount_code(request, discount_id):
    discount = get_object_or_404(DiscountCode, id=discount_id)
    code = discount.code
    discount.delete()
    messages.warning(request, f"Discount code '{code}' was removed.")
    return redirect("monitor:monetization")


@staff_member_required
@require_POST
def quick_grant_access(request):
    student_ident = request.POST.get("student_ident", "").strip()
    access_type = request.POST.get("access_type", "all_access").strip()
    course_code = request.POST.get("course_code", "all").strip().upper()
    expires_str = request.POST.get("expires_at", "").strip()

    student = User.objects.filter(
        Q(public_id__iexact=student_ident) | Q(username__iexact=student_ident) | Q(email__iexact=student_ident)
    ).first()

    if not student:
        messages.error(request, f"Could not find student '{student_ident}'. Enter a valid ID, username, or email.")
        return redirect("monitor:monetization")

    plan_config = PlanConfig.get_solo()
    if expires_str:
        try:
            expires_at = timezone.make_aware(datetime.strptime(expires_str, "%Y-%m-%d"))
        except Exception:
            expires_at = plan_config.semester_end_date
    else:
        expires_at = plan_config.semester_end_date

    CourseAccess.objects.create(
        user=student,
        access_type=access_type,
        course_code=course_code if access_type == "single_course" else "all",
        starts_at=timezone.now(),
        expires_at=expires_at,
        is_active=True,
        granted_by=CourseAccess.GrantedBy.ADMIN_MANUAL,
        reference=f"quick_{request.user.username}_{int(timezone.now().timestamp())}",
    )

    messages.success(request, f"Granted {access_type.upper()} ({course_code}) to {student.username} until {expires_at.strftime('%Y-%m-%d')}.")
    return redirect("monitor:monetization")


@staff_member_required
@require_POST
def quick_revoke_access(request, access_id):
    grant = get_object_or_404(CourseAccess, id=access_id)
    grant.is_active = False
    grant.save(update_fields=["is_active"])
    messages.warning(request, f"Access grant #{access_id} for {grant.user.username} revoked.")
    return redirect("monitor:monetization")


@staff_member_required
@require_POST
def verify_transaction_manual(request, reference):
    tx = get_object_or_404(PaymentTransaction, reference=reference)
    config = PlanConfig.get_solo()

    if tx.status == PaymentTransaction.Status.SUCCESS:
        messages.info(request, f"Transaction {reference} is already marked as successful.")
        return redirect("monitor:monetization")

    with transaction.atomic():
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

    messages.success(request, f"Transaction {reference} verified and course access unlocked for {tx.user.username}!")
    return redirect("monitor:monetization")


@staff_member_required
@require_POST
def update_free_topics(request):
    for code in ["ANA 201", "ANA 203", "PIO 201"]:
        field_name = f"free_topic_{code.replace(' ', '_').lower()}"
        topic_id = request.POST.get(field_name, "").strip()
        if topic_id:
            cfg, _ = CourseTopicConfig.objects.get_or_create(course_code=code)
            cfg.free_topic_id = topic_id
            cfg.save()

    messages.success(request, "Free sample topics per course updated successfully.")
    return redirect("monitor:monetization")


# ─── Questions Management ───────────────────────────────────────────────────

@staff_member_required
def questions_list(request):
    q_search = request.GET.get("q", "").strip()
    subject_filter = request.GET.get("subject", "").strip()
    status_filter = request.GET.get("status", "").strip()

    questions = Question.objects.select_related("topic__subject").order_by("-created_at")

    if q_search:
        questions = questions.filter(
            Q(text__icontains=q_search) | Q(external_id__icontains=q_search) | Q(explanation__icontains=q_search)
        )
    if subject_filter:
        questions = questions.filter(topic__subject__slug=subject_filter)
    if status_filter:
        questions = questions.filter(explanation_status=status_filter)

    total_count = Question.objects.count()
    reviewed_count = Question.objects.filter(explanation_status=Question.ExplanationStatus.REVIEWED).count()
    pending_count = total_count - reviewed_count

    subjects = Subject.objects.filter(is_active=True)

    return render(request, "monitor/questions_list.html", {
        "questions": questions[:150],
        "total_count": total_count,
        "reviewed_count": reviewed_count,
        "pending_count": pending_count,
        "coverage_pct": percentage(reviewed_count, total_count),
        "subjects": subjects,
        "q_search": q_search,
        "subject_filter": subject_filter,
        "status_filter": status_filter,
    })


@staff_member_required
@require_http_methods(["GET", "POST"])
def add_question(request):
    subjects = Subject.objects.filter(is_active=True).prefetch_related("topics")

    if request.method == "POST":
        subject_id = request.POST.get("subject_id")
        topic_id = request.POST.get("topic_id")
        new_topic_name = request.POST.get("new_topic_name", "").strip()
        text = request.POST.get("text", "").strip()
        opt_a = request.POST.get("option_a", "").strip()
        opt_b = request.POST.get("option_b", "").strip()
        opt_c = request.POST.get("option_c", "").strip()
        opt_d = request.POST.get("option_d", "").strip()
        correct_idx_str = request.POST.get("correct_option", "0").strip()
        explanation = request.POST.get("explanation", "").strip()
        difficulty = request.POST.get("difficulty", "standard").strip()
        source = request.POST.get("source", "").strip()
        year_str = request.POST.get("question_year", "").strip()

        if not text or not opt_a or not opt_b or not opt_c or not opt_d:
            messages.error(request, "Question text and all four options (A, B, C, D) are required.")
            return render(request, "monitor/question_add.html", {"subjects": subjects})

        subject = get_object_or_404(Subject, id=subject_id)

        # Handle Topic
        if new_topic_name:
            slug = new_topic_name.lower().replace(" ", "-").replace("/", "-")[:50]
            topic, _ = Topic.objects.get_or_create(subject=subject, slug=slug, defaults={"name": new_topic_name})
        elif topic_id:
            topic = get_object_or_404(Topic, id=topic_id, subject=subject)
        else:
            # Fallback to subject's first topic or create a general topic
            topic = subject.topics.first()
            if not topic:
                topic = Topic.objects.create(subject=subject, slug="general", name="General")

        try:
            correct_index = int(correct_idx_str)
        except ValueError:
            correct_index = 0

        question_year = int(year_str) if year_str.isdigit() else None
        external_id = f"{subject.slug[:4]}-{topic.slug[:6]}-{uuid.uuid4().hex[:6]}"

        question = Question.objects.create(
            external_id=external_id,
            topic=topic,
            text=text,
            options=[opt_a, opt_b, opt_c, opt_d],
            correct_index=correct_index,
            explanation=explanation,
            explanation_status=Question.ExplanationStatus.REVIEWED if explanation else Question.ExplanationStatus.MISSING,
            difficulty=difficulty,
            source=source,
            question_year=question_year,
            is_active=True,
        )

        messages.success(request, f"Question added successfully! External ID: {question.external_id}")
        if request.POST.get("save_and_add_another"):
            return redirect("monitor:add-question")
        return redirect("monitor:questions")

    return render(request, "monitor/question_add.html", {"subjects": subjects})


# ─── Subjects & CSV Export ──────────────────────────────────────────────────

@staff_member_required
def subject_detail(request, slug):
    subject = get_object_or_404(Subject, slug=slug)
    attempts = Attempt.objects.filter(question__topic__subject=subject)
    total = attempts.count()
    correct = attempts.filter(is_correct=True).count()
    topics = subject.topics.annotate(
        total_attempts=Count("questions__attempts"),
        correct_attempts=Count("questions__attempts", filter=Q(questions__attempts__is_correct=True)),
        student_count=Count("questions__attempts__user", distinct=True)
    )
    for topic in topics:
        topic.accuracy = percentage(topic.correct_attempts, topic.total_attempts)
    difficult = Question.objects.filter(topic__subject=subject, attempts__isnull=False).annotate(
        total_attempts=Count("attempts"),
        correct_attempts=Count("attempts", filter=Q(attempts__is_correct=True))
    ).order_by("correct_attempts", "-total_attempts")[:12]
    for question in difficult:
        question.accuracy = percentage(question.correct_attempts, question.total_attempts)
    tests = session_analytics(PracticeSession.objects.filter(subject=subject))
    active_questions = Question.objects.filter(topic__subject=subject, is_active=True)
    question_count = active_questions.count()
    reviewed_count = active_questions.filter(explanation_status=Question.ExplanationStatus.REVIEWED).count()
    pending_count = question_count - reviewed_count
    return render(request, "monitor/subject_detail.html", {
        "subject": subject,
        "total": total,
        "accuracy": percentage(correct, total),
        "student_count": attempts.values("user_id").distinct().count(),
        "tests": tests,
        "topics": topics,
        "difficult": difficult,
        "question_count": question_count,
        "reviewed_count": reviewed_count,
        "pending_count": pending_count,
        "explanation_coverage": percentage(reviewed_count, question_count)
    })


@staff_member_required
@require_POST
@never_cache
def reset_student_password(request, public_id):
    student = get_object_or_404(User, public_id=public_id, is_staff=False)
    generated_password = temporary_password()
    student.set_password(generated_password)
    student.must_change_password = True
    student.save(update_fields=("password", "must_change_password"))
    Token.objects.filter(user=student).delete()
    response = render(request, "monitor/password_reset_result.html", {
        "student": student, "temporary_password": generated_password
    })
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    response["Pragma"] = "no-cache"
    return response


@staff_member_required
def export_students_csv(request):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="seomtorch-students-{timezone.localdate()}.csv"'
    writer = csv.writer(response)
    writer.writerow([
        "Student ID", "Username", "Email", "Phone", "Gender", "Mode", "Target Exam / University",
        "Tests Taken", "Average Test Score %", "Best Test Score %", "Questions Answered",
        "Correct Answers", "Answer Accuracy %", "XP", "Level", "Current Streak", "Best Streak", "Joined"
    ])
    completed_tests = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED).only(
        "user_id", "total_questions", "correct_answers"
    )
    users = User.objects.filter(is_staff=False).select_related(
        "learning_stats", "aspirant_profile", "university_profile"
    ).prefetch_related(
        Prefetch("practice_sessions", queryset=completed_tests, to_attr="completed_test_rows")
    ).annotate(
        attempt_count=Count("attempts"),
        correct_count=Count("attempts", filter=Q(attempts__is_correct=True))
    ).order_by("-date_joined")

    for user in users:
        total = user.attempt_count
        correct = user.correct_count
        accuracy = percentage(correct, total)
        stats = getattr(user, "learning_stats", None)
        scores = [percentage(item.correct_answers, item.total_questions) for item in user.completed_test_rows]

        academic_target = ""
        if user.active_mode == "university" and hasattr(user, "university_profile"):
            academic_target = f"{user.university_profile.university_name} ({user.university_profile.level}L {user.university_profile.department})"
        elif hasattr(user, "aspirant_profile"):
            academic_target = f"{user.aspirant_profile.get_exam_type_display()} {user.aspirant_profile.target_year}"

        writer.writerow([
            user.public_id, csv_safe(user.username), csv_safe(user.email), csv_safe(user.phone_number),
            user.get_gender_display() or "", user.active_mode, academic_target,
            len(scores), round(sum(scores) / len(scores)) if scores else 0, max(scores, default=0),
            total, correct, accuracy,
            stats.xp if stats else 0, stats.level if stats else 1,
            stats.live_current_streak if stats else 0, stats.best_streak if stats else 0,
            user.date_joined.strftime("%Y-%m-%d")
        ])
    return response


# ─── Question Flags & Reports ───────────────────────────────────────────────

@staff_member_required
def question_flags(request):
    status_filter = request.GET.get("status", "open")
    reports = QuestionReport.objects.select_related("question__topic__subject", "user").filter(
        status=status_filter
    ).order_by("-created_at")[:200]
    return render(request, "monitor/flags.html", {"reports": reports, "status_filter": status_filter})


@staff_member_required
@require_POST
def resolve_flag(request, report_id):
    report = get_object_or_404(QuestionReport, id=report_id)
    new_status = request.POST.get("status", "reviewed")
    if new_status in [c[0] for c in QuestionReport.Status.choices]:
        report.status = new_status
        report.save(update_fields=["status"])
        messages.success(request, f"Flag #{str(report_id)[:8]} marked as {new_status}.")
    return redirect("monitor:flags")
