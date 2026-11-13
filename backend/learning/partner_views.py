from collections import defaultdict

from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.core.paginator import Paginator
from django.db.models import Avg, Case, CharField, Count, ExpressionWrapper, F, FloatField, Max, OuterRef, Q, Subquery, Sum, Value, When, Window
from django.db.models.functions import Coalesce
from django.db.models.functions import RowNumber
from django.http import HttpResponseForbidden
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_POST

from .models import Attempt, PracticeSession
from monetization.models import PartnerAdminMembership, PartnerOrganization, PartnerStudentMembership


def partner_login(request):
    if request.user.is_authenticated and (request.user.is_staff or PartnerAdminMembership.objects.filter(user=request.user, is_active=True, organization__is_active=True).exists()):
        return redirect("partner:dashboard")
    if request.method == "POST":
        email = request.POST.get("email", "").strip().lower()
        password = request.POST.get("password", "")
        user = authenticate(request, username=email, password=password)
        if user and user.is_active and (user.is_staff or PartnerAdminMembership.objects.filter(user=user, is_active=True, organization__is_active=True).exists()):
            login(request, user)
            return redirect("partner:dashboard")
        messages.error(request, "Those sign-in details do not have active partner portal access.")
    return render(request, "partner/login.html")


@require_POST
def partner_logout(request):
    logout(request)
    return redirect("partner:login")


@never_cache
def partner_dashboard(request):
    if not request.user.is_authenticated:
        return redirect("partner:login")
    if request.user.is_staff or request.user.is_superuser:
        organizations = list(PartnerOrganization.objects.filter(is_active=True).order_by("name"))
    else:
        memberships = PartnerAdminMembership.objects.filter(
            user=request.user, is_active=True, organization__is_active=True,
        ).select_related("organization").order_by("organization__name")
        organizations = [row.organization for row in memberships]
    if not organizations:
        return HttpResponseForbidden("Partner portal access is not enabled for this account.")

    selected_slug = request.GET.get("org", "").strip()
    organization = next((item for item in organizations if item.slug == selected_slug), None)
    if not organization and len(organizations) == 1:
        organization = organizations[0]

    context = {"organizations": organizations, "organization": organization, "now": timezone.now(), "can_manage_partners": request.user.is_staff or request.user.is_superuser}
    if organization:
        member_qs = PartnerStudentMembership.objects.filter(organization=organization).select_related("user").order_by("-linked_at")
        member_rows = list(member_qs)
        user_ids = [row.user_id for row in member_rows]
        answer_counts = Attempt.objects.filter(session_id=OuterRef("pk")).order_by().values("session_id").annotate(
            answered=Count("id"),
            correct=Count("id", filter=Q(is_correct=True)),
        )
        sessions = PracticeSession.objects.filter(
            user_id__in=user_ids,
            track="university",
            status=PracticeSession.Status.COMPLETED,
            completed_at__isnull=False,
        ).annotate(
            answered_count=Subquery(answer_counts.values("answered")[:1]),
            correct_count=Subquery(answer_counts.values("correct")[:1]),
        ).filter(answered_count__gt=0).annotate(
            test_score=ExpressionWrapper(F("correct_count") * 100.0 / F("answered_count"), output_field=FloatField()),
        ).select_related("subject").order_by("-completed_at")

        stats_by_user = defaultdict(lambda: {"tests": 0, "score_total": 0, "correct": 0, "answered": 0, "latest": None, "recent": [], "courses": defaultdict(lambda: {"tests": 0, "correct": 0, "answered": 0})})
        course_stats = defaultdict(lambda: {"tests": 0, "correct": 0, "answered": 0})
        for row in sessions.values("user_id").annotate(
            tests=Count("id"),
            average_score=Avg("test_score"),
            correct=Sum("correct_count"),
            answered=Sum("answered_count"),
            latest=Max("completed_at"),
        ):
            stats_by_user[row["user_id"]].update({
                "tests": row["tests"],
                "score_total": (row["average_score"] or 0) * row["tests"],
                "correct": row["correct"] or 0,
                "answered": row["answered"] or 0,
                "latest": row["latest"],
            })
        course_key = Case(
            When(course_code="", then=Coalesce("subject__code", Value("University"))),
            default=F("course_code"),
            output_field=CharField(),
        )
        for row in sessions.annotate(course_key=course_key).values("user_id", "course_key").annotate(
            tests=Count("id"), correct=Sum("correct_count"), answered=Sum("answered_count"),
        ):
            course = course_stats[row["course_key"]]
            course["tests"] += row["tests"]
            course["correct"] += row["correct"] or 0
            course["answered"] += row["answered"] or 0
            stats_by_user[row["user_id"]]["courses"][row["course_key"]] = {
                "tests": row["tests"], "correct": row["correct"] or 0, "answered": row["answered"] or 0,
            }

        session_rows = sessions.annotate(
            student_test_rank=Window(
                expression=RowNumber(),
                partition_by=[F("user_id")],
                order_by=F("completed_at").desc(),
            ),
        ).filter(student_test_rank__lte=5).order_by("user_id", "-completed_at")
        for session in session_rows:
            stats = stats_by_user[session.user_id]
            answered = session.answered_count
            correct = session.correct_count
            score = round((correct / answered) * 100) if answered else 0
            if len(stats["recent"]) < 5:
                stats["recent"].append({"focus": session.topic_title or (session.subject.code if session.subject else session.course_code or "University practice"), "score": score, "date": session.completed_at})

        students = []
        for membership in member_rows:
            stats = stats_by_user[membership.user_id]
            student_courses = [
                {"code": code, **course, "accuracy": round(course["correct"] / course["answered"] * 100) if course["answered"] else 0}
                for code, course in sorted(stats["courses"].items())
            ]
            students.append({
                "user": membership.user,
                "membership_id": membership.id,
                "linked_at": membership.linked_at,
                "tests": stats["tests"],
                "average_score": round(stats["score_total"] / stats["tests"]) if stats["tests"] else 0,
                "accuracy": round(stats["correct"] / stats["answered"] * 100) if stats["answered"] else 0,
                "latest_activity": stats["latest"],
                "recent_tests": stats["recent"],
                "courses": student_courses,
            })
        sorted_courses = sorted(
            ({"code": code, **stats, "accuracy": round(stats["correct"] / stats["answered"] * 100) if stats["answered"] else 0} for code, stats in course_stats.items()),
            key=lambda row: (-row["tests"], row["code"]),
        )
        students_with_tests = [row for row in students if row["tests"]]
        context.update({
            "student_count": len(students),
            "test_count": sum(row["tests"] for row in students),
            "students": Paginator(students, 25).get_page(request.GET.get("page")),
            "courses": sorted_courses,
            "average_score": round(sum(row["average_score"] for row in students_with_tests) / len(students_with_tests)) if students_with_tests else 0,
        })
    return render(request, "partner/dashboard.html", context)
