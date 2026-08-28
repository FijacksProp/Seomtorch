from django.contrib import admin
from .models import ActivityEvent, Attempt, BadgeDefinition, Bookmark, Challenge, ChallengeParticipant, PracticeSession, Question, QuestionBankRelease, Subject, Topic, UserBadge, UserStats, Passage, QuestionComment, QuestionReport

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
    list_display = ("short_text", "topic", "question_year", "explanation_status", "has_question_image", "is_active")
    list_filter = ("topic__subject", "topic", "question_year", "explanation_status", "difficulty", "is_active")
    search_fields = ("external_id", "text", "explanation")
    list_editable = ("is_active",)
    readonly_fields = ("external_id", "created_at", "updated_at")
    list_select_related = ("topic__subject", "passage")
    def short_text(self, obj): return obj.text[:75]
    @admin.display(boolean=True, description="Image")
    def has_question_image(self, obj): return bool(obj.image_url)

@admin.register(QuestionBankRelease)
class QuestionBankReleaseAdmin(admin.ModelAdmin):
    list_display = ("version", "question_count", "imported_at")
    readonly_fields = ("version", "question_count", "imported_at")

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

@admin.register(BadgeDefinition)
class BadgeDefinitionAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "tier", "target", "is_active")
    list_filter = ("category", "tier", "is_active")
    search_fields = ("code", "name", "description")

@admin.register(UserBadge)
class UserBadgeAdmin(admin.ModelAdmin):
    list_display = ("user", "badge", "earned_at", "seen_at")
    list_filter = ("badge__category", "badge", "earned_at")
    search_fields = ("user__public_id", "user__username", "badge__name")
    list_select_related = ("user", "badge")

class ChallengeParticipantInline(admin.TabularInline):
    model = ChallengeParticipant
    extra = 0
    readonly_fields = ("user", "status", "practice_session", "started_at", "deadline_at", "completed_at", "correct_answers", "answered_questions", "duration_seconds", "bonus_xp", "bonus_awarded_at", "hidden_at")

@admin.register(Challenge)
class ChallengeAdmin(admin.ModelAdmin):
    list_display = ("title", "creator", "subject_label", "question_count", "duration_minutes", "starts_at", "ends_at")
    list_filter = ("subject", "starts_at", "ends_at")
    search_fields = ("title", "creator__public_id", "creator__username")
    readonly_fields = ("id", "question_payload", "created_at")
    inlines = (ChallengeParticipantInline,)

@admin.register(ChallengeParticipant)
class ChallengeParticipantAdmin(admin.ModelAdmin):
    list_display = ("user", "challenge", "status", "correct_answers", "answered_questions", "bonus_xp", "started_at", "completed_at", "hidden_at")
    list_filter = ("status", "challenge__subject", "started_at")
    search_fields = ("user__public_id", "user__username", "challenge__title")
    list_select_related = ("user", "challenge")
