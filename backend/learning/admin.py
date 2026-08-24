from django.contrib import admin
from .models import ActivityEvent, Attempt, Bookmark, PracticeSession, Question, Subject, Topic, UserStats, Passage, QuestionComment, QuestionReport

@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "position", "is_active")
    list_editable = ("position", "is_active")
    prepopulated_fields = {"slug": ("name",)}

@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ("name", "subject", "question_total")
    list_filter = ("subject",)
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}
    def question_total(self, obj): return obj.questions.count()

@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("short_text", "topic", "passage", "question_year", "difficulty", "is_active")
    list_filter = ("topic__subject", "topic", "question_year", "difficulty", "is_active")
    search_fields = ("external_id", "text", "explanation")
    list_editable = ("is_active",)
    readonly_fields = ("external_id", "created_at", "updated_at")
    list_select_related = ("topic__subject", "passage")
    def short_text(self, obj): return obj.text[:75]

@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ("user", "question_short", "is_correct", "xp_earned", "answered_at")
    list_filter = ("is_correct", "question__topic__subject", "answered_at")
    search_fields = ("user__public_id", "user__username", "user__email", "question__text")
    readonly_fields = ("user", "question", "session", "client_id", "selected_index", "is_correct", "xp_earned", "duration_ms", "answered_at")
    list_select_related = ("user", "question__topic__subject")
    def question_short(self, obj): return obj.question.text[:65]

@admin.register(PracticeSession)
class PracticeSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "subject", "topic", "status", "correct_answers", "total_questions", "duration_minutes", "started_at")
    list_filter = ("status", "subject", "started_at")
    search_fields = ("id", "user__public_id", "user__username", "user__email")
    readonly_fields = ("id", "question_ids", "started_at", "completed_at")

@admin.register(UserStats)
class UserStatsAdmin(admin.ModelAdmin):
    list_display = ("user", "xp", "level_value", "current_streak", "best_streak", "last_study_date")
    search_fields = ("user__public_id", "user__username", "user__email")
    def level_value(self, obj): return obj.level

admin.site.register(Bookmark)
admin.site.register(ActivityEvent)
admin.site.register(Passage)
admin.site.register(QuestionComment)
admin.site.register(QuestionReport)
