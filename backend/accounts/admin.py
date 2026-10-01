from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import AspirantProfile, UniversityProfile, User


class AspirantProfileInline(admin.StackedInline):
    model = AspirantProfile
    extra = 0
    max_num = 1


class UniversityProfileInline(admin.StackedInline):
    model = UniversityProfile
    extra = 0
    max_num = 1


@admin.register(User)
class SeomtorchUserAdmin(UserAdmin):
    list_display = ("username", "email", "public_id", "user_type", "active_mode", "must_change_password", "is_staff", "is_active", "date_joined")
    list_filter = ("user_type", "active_mode", "is_staff", "is_active", "date_joined")
    search_fields = ("public_id", "username", "email")
    ordering = ("-date_joined",)
    readonly_fields = ("public_id", "date_joined", "last_login", "created_at")
    fieldsets = UserAdmin.fieldsets + (
        ("Seomtorch identity", {"fields": ("public_id", "created_at", "must_change_password")}),
        ("Segmentation", {"fields": ("user_type", "active_mode")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (("Contact", {"fields": ("email",)}),)
    inlines = [AspirantProfileInline, UniversityProfileInline]
