import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

class Subject(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=240, blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("position", "name")

    def __str__(self): return self.name

class Topic(models.Model):
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="topics")
    name = models.CharField(max_length=160)
    slug = models.SlugField()

    class Meta:
        ordering = ("subject__position", "name")
        constraints = [models.UniqueConstraint(fields=("subject", "slug"), name="unique_subject_topic")]

    def __str__(self): return f"{self.subject.name} · {self.name}"

class Passage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="passages")
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField()
    source = models.CharField(max_length=180, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("subject__position", "title")

    def __str__(self): return self.title or f"Passage ({self.subject.name})"

class Question(models.Model):
    external_id = models.CharField(max_length=120, unique=True, db_index=True)
    topic = models.ForeignKey(Topic, on_delete=models.PROTECT, related_name="questions")
    passage = models.ForeignKey(Passage, on_delete=models.SET_NULL, null=True, blank=True, related_name="questions")
    text = models.TextField()
    options = models.JSONField()
    correct_index = models.PositiveSmallIntegerField()
    explanation = models.TextField()
    difficulty = models.CharField(max_length=30, default="standard")
    source = models.CharField(max_length=180, blank=True)
    question_year = models.PositiveSmallIntegerField(null=True, blank=True)
    video_url = models.URLField(blank=True, default="")
    image_url = models.CharField(max_length=500, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("topic__subject__position", "topic__name", "external_id")

    def __str__(self): return self.text[:90]

class PracticeSession(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        ABANDONED = "abandoned", "Abandoned"

    class Mode(models.TextChoices):
        TIMED = "timed", "Timed Practice"
        NORMAL = "normal", "Normal Practice"
        DAILY = "daily", "Daily Sprint"
        SAVED = "saved", "Saved Review"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="practice_sessions")
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="practice_sessions", null=True, blank=True)
    topic = models.ForeignKey(Topic, on_delete=models.PROTECT, related_name="practice_sessions", null=True, blank=True)
    question_ids = models.JSONField(default=list)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    mode = models.CharField(max_length=12, choices=Mode.choices, default=Mode.TIMED)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    total_questions = models.PositiveSmallIntegerField(default=0)
    correct_answers = models.PositiveSmallIntegerField(default=0)
    duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ("-started_at",)

    @property
    def accuracy(self):
        return round(self.correct_answers / self.total_questions * 100) if self.total_questions else 0

class Attempt(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attempts")
    question = models.ForeignKey(Question, on_delete=models.PROTECT, related_name="attempts")
    session = models.ForeignKey(PracticeSession, on_delete=models.SET_NULL, related_name="attempts", null=True, blank=True)
    client_id = models.UUIDField(default=uuid.uuid4)
    selected_index = models.PositiveSmallIntegerField()
    is_correct = models.BooleanField()
    xp_earned = models.PositiveSmallIntegerField(default=0)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    answered_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-answered_at",)
        constraints = [models.UniqueConstraint(fields=("user", "client_id"), name="unique_user_client_attempt")]
        indexes = [models.Index(fields=("user", "-answered_at")), models.Index(fields=("question", "is_correct"))]

class Bookmark(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookmarks")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="bookmarked_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("user", "question"), name="unique_user_bookmark")]

class QuestionComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="comments")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="question_comments")
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at",)

    def __str__(self): return f"{self.user} on {self.question.text[:40]}"

class QuestionReport(models.Model):
    class Reason(models.TextChoices):
        TYPO = "typo", "Typo"
        WRONG_KEY = "wrong_key", "Wrong Answer Key"
        BROKEN_MATH = "broken_math", "Broken Math/Formula"
        UNCLEAR = "unclear", "Unclear Explanation"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        REVIEWED = "reviewed", "Reviewed"
        RESOLVED = "resolved", "Resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="reports")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="question_reports")
    reason = models.CharField(max_length=20, choices=Reason.choices)
    details = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [models.UniqueConstraint(fields=("user", "question", "reason"), name="unique_user_question_report")]

    def __str__(self): return f"{self.get_reason_display()} — {self.question.text[:40]}"

class UserStats(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="learning_stats")
    xp = models.PositiveIntegerField(default=0)
    current_streak = models.PositiveIntegerField(default=0)
    best_streak = models.PositiveIntegerField(default=0)
    last_study_date = models.DateField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def level(self): return 1 + self.xp // 250

    @property
    def live_current_streak(self):
        if not self.last_study_date or self.last_study_date < timezone.localdate() - timedelta(days=1):
            return 0
        return self.current_streak

    def register_correct_answer(self):
        current_date = timezone.localdate()
        self.xp += 5
        if self.last_study_date != current_date:
            self.current_streak = self.current_streak + 1 if self.last_study_date == current_date - timedelta(days=1) else 1
            self.best_streak = max(self.best_streak, self.current_streak)
            self.last_study_date = current_date
        self.save()

    def register_study_day(self):
        current_date = timezone.localdate()
        if self.last_study_date == current_date:
            return
        self.current_streak = self.current_streak + 1 if self.last_study_date == current_date - timedelta(days=1) else 1
        self.best_streak = max(self.best_streak, self.current_streak)
        self.last_study_date = current_date
        self.save()

class ActivityEvent(models.Model):
    class Type(models.TextChoices):
        REGISTERED = "registered", "Registered"
        SIGNED_IN = "signed_in", "Signed in"
        SIGNED_OUT = "signed_out", "Signed out"
        SESSION_STARTED = "session_started", "Session started"
        SESSION_COMPLETED = "session_completed", "Session completed"
        ANSWERED = "answered", "Question answered"
        BOOKMARKED = "bookmarked", "Question bookmarked"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="activity_events")
    event_type = models.CharField(max_length=30, choices=Type.choices)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("user", "-created_at")), models.Index(fields=("event_type", "-created_at"))]
