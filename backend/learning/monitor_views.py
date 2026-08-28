from datetime import timedelta

from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import Avg, Count, Prefetch, Q
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_http_methods, require_POST
from django.utils import timezone

from .analytics import session_analytics, user_test_analytics
from .models import ActivityEvent, Attempt, PracticeSession, Question, Subject, UserStats

User = get_user_model()

def percentage(correct, total): return round(correct / total * 100) if total else 0

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

@staff_member_required
def dashboard(request):
    today = timezone.localdate()
    since_week = timezone.now() - timedelta(days=7)
    student_filter = Q(is_staff=False)
    total_students = User.objects.filter(student_filter).count()
    active_today = ActivityEvent.objects.filter(user__is_staff=False, created_at__date=today).values("user_id").distinct().count()
    active_week = ActivityEvent.objects.filter(user__is_staff=False, created_at__gte=since_week).values("user_id").distinct().count()
    today_attempts = Attempt.objects.filter(answered_at__date=today)
    total_today = today_attempts.count(); correct_today = today_attempts.filter(is_correct=True).count()
    tests_today = session_analytics(PracticeSession.objects.filter(completed_at__date=today))
    total_tests = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED).count()
    subjects = Subject.objects.filter(is_active=True).annotate(total_attempts=Count("topics__questions__attempts", distinct=True), correct_attempts=Count("topics__questions__attempts", filter=Q(topics__questions__attempts__is_correct=True), distinct=True), student_count=Count("topics__questions__attempts__user", distinct=True), test_count=Count("practice_sessions", filter=Q(practice_sessions__status=PracticeSession.Status.COMPLETED), distinct=True), question_count=Count("topics__questions", filter=Q(topics__questions__is_active=True), distinct=True), reviewed_count=Count("topics__questions", filter=Q(topics__questions__is_active=True, topics__questions__explanation_status=Question.ExplanationStatus.REVIEWED), distinct=True))
    for subject in subjects:
        subject.accuracy = percentage(subject.correct_attempts, subject.total_attempts)
        subject.explanation_coverage = percentage(subject.reviewed_count, subject.question_count)
    recent_students = User.objects.filter(is_staff=False).select_related("learning_stats").order_by("-date_joined")[:7]
    recent_events = ActivityEvent.objects.select_related("user").filter(user__is_staff=False)[:12]
    context = {"total_students": total_students, "active_today": active_today, "active_week": active_week, "tests_today": tests_today["tests_taken"], "average_test_score_today": tests_today["average_score"], "total_tests": total_tests, "attempts_today": total_today, "accuracy_today": percentage(correct_today, total_today), "subjects": subjects, "recent_students": recent_students, "recent_events": recent_events}
    return render(request, "monitor/dashboard.html", context)

@staff_member_required
def students(request):
    query = request.GET.get("q", "").strip()
    completed_tests = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED).only("user_id", "total_questions", "correct_answers", "completed_at")
    users = User.objects.filter(is_staff=False).select_related("learning_stats").prefetch_related(Prefetch("practice_sessions", queryset=completed_tests, to_attr="completed_test_rows")).annotate(attempt_count=Count("attempts", distinct=True), correct_count=Count("attempts", filter=Q(attempts__is_correct=True), distinct=True)).order_by("-date_joined")
    if query: users = users.filter(Q(public_id__iexact=query) | Q(username__icontains=query) | Q(email__icontains=query))
    for user in users:
        user.accuracy = percentage(user.correct_count, user.attempt_count)
        scores = [percentage(item.correct_answers, item.total_questions) for item in user.completed_test_rows]
        user.test_count = len(scores); user.average_test_score = round(sum(scores) / len(scores)) if scores else 0
    return render(request, "monitor/students.html", {"students": users[:250], "query": query})

@staff_member_required
def student_detail(request, public_id):
    student = get_object_or_404(User.objects.select_related("learning_stats"), public_id=public_id, is_staff=False)
    attempts = student.attempts.select_related("question__topic__subject")
    subject_rows = attempts.values("question__topic__subject__name", "question__topic__subject__slug").annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True))).order_by("question__topic__subject__position")
    topic_rows = attempts.values("question__topic__name", "question__topic__subject__name").annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True))).order_by("correct", "-total")[:12]
    for row in subject_rows: row["accuracy"] = percentage(row["correct"], row["total"])
    for row in topic_rows: row["accuracy"] = percentage(row["correct"], row["total"])
    total = attempts.count(); correct = attempts.filter(is_correct=True).count()
    tests = user_test_analytics(student, include_recent=True)
    return render(request, "monitor/student_detail.html", {"student": student, "total": total, "correct": correct, "accuracy": percentage(correct, total), "tests": tests, "subject_rows": subject_rows, "topic_rows": topic_rows, "recent_attempts": attempts[:15], "recent_events": student.activity_events.all()[:15]})

@staff_member_required
def subject_detail(request, slug):
    subject = get_object_or_404(Subject, slug=slug)
    attempts = Attempt.objects.filter(question__topic__subject=subject)
    total = attempts.count(); correct = attempts.filter(is_correct=True).count()
    topics = subject.topics.annotate(total_attempts=Count("questions__attempts"), correct_attempts=Count("questions__attempts", filter=Q(questions__attempts__is_correct=True)), student_count=Count("questions__attempts__user", distinct=True))
    for topic in topics: topic.accuracy = percentage(topic.correct_attempts, topic.total_attempts)
    difficult = Question.objects.filter(topic__subject=subject, attempts__isnull=False).annotate(total_attempts=Count("attempts"), correct_attempts=Count("attempts", filter=Q(attempts__is_correct=True))).order_by("correct_attempts", "-total_attempts")[:12]
    for question in difficult: question.accuracy = percentage(question.correct_attempts, question.total_attempts)
    tests = session_analytics(PracticeSession.objects.filter(subject=subject))
    active_questions = Question.objects.filter(topic__subject=subject, is_active=True)
    question_count = active_questions.count()
    reviewed_count = active_questions.filter(explanation_status=Question.ExplanationStatus.REVIEWED).count()
    pending_count = question_count - reviewed_count
    return render(request, "monitor/subject_detail.html", {"subject": subject, "total": total, "accuracy": percentage(correct, total), "student_count": attempts.values("user_id").distinct().count(), "tests": tests, "topics": topics, "difficult": difficult, "question_count": question_count, "reviewed_count": reviewed_count, "pending_count": pending_count, "explanation_coverage": percentage(reviewed_count, question_count)})

import csv
import secrets
import string

from django.http import HttpResponse
from django.views.decorators.cache import never_cache
from rest_framework.authtoken.models import Token

def csv_safe(value):
    text = str(value or "")
    return f"'{text}" if text.startswith(("=", "+", "-", "@")) else text

def temporary_password():
    required = [secrets.choice(string.ascii_uppercase), secrets.choice(string.ascii_lowercase), secrets.choice(string.digits), secrets.choice("!@#$%&*?")]
    characters = required + [secrets.choice(string.ascii_letters + string.digits + "!@#$%&*?") for _ in range(10)]
    secrets.SystemRandom().shuffle(characters)
    return "".join(characters)

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
    response = render(request, "monitor/password_reset_result.html", {"student": student, "temporary_password": generated_password})
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    response["Pragma"] = "no-cache"
    return response

@staff_member_required
def export_students_csv(request):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="seomtorch-students-{timezone.localdate()}.csv"'
    writer = csv.writer(response)
    writer.writerow(["Student ID", "Username", "Email", "Tests Taken", "Average Test Score %", "Best Test Score %", "Questions Answered", "Correct Answers", "Answer Accuracy %", "XP", "Level", "Current Streak", "Best Streak", "Joined"])
    completed_tests = PracticeSession.objects.filter(status=PracticeSession.Status.COMPLETED).only("user_id", "total_questions", "correct_answers")
    users = User.objects.filter(is_staff=False).select_related("learning_stats").prefetch_related(Prefetch("practice_sessions", queryset=completed_tests, to_attr="completed_test_rows")).annotate(
        attempt_count=Count("attempts"),
        correct_count=Count("attempts", filter=Q(attempts__is_correct=True))
    ).order_by("-date_joined")
    for user in users:
        total = user.attempt_count
        correct = user.correct_count
        accuracy = percentage(correct, total)
        stats = getattr(user, "learning_stats", None)
        scores = [percentage(item.correct_answers, item.total_questions) for item in user.completed_test_rows]
        writer.writerow([
            user.public_id, csv_safe(user.username), csv_safe(user.email), len(scores), round(sum(scores) / len(scores)) if scores else 0, max(scores, default=0), total, correct, accuracy,
            stats.xp if stats else 0, stats.level if stats else 1,
            stats.live_current_streak if stats else 0, stats.best_streak if stats else 0,
            user.date_joined.strftime("%Y-%m-%d")
        ])
    return response

@staff_member_required
def question_flags(request):
    from .models import QuestionReport
    status_filter = request.GET.get("status", "open")
    reports = QuestionReport.objects.select_related("question__topic__subject", "user").filter(status=status_filter).order_by("-created_at")[:200]
    return render(request, "monitor/flags.html", {"reports": reports, "status_filter": status_filter})

@staff_member_required
@require_POST
def resolve_flag(request, report_id):
    import uuid as uuid_mod
    from .models import QuestionReport
    report = get_object_or_404(QuestionReport, id=report_id)
    new_status = request.POST.get("status", "reviewed")
    if new_status in [c[0] for c in QuestionReport.Status.choices]:
        report.status = new_status
        report.save(update_fields=["status"])
    return redirect("monitor:flags")
