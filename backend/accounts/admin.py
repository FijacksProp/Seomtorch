from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User

@admin.register(User)
class SeomtorchUserAdmin(UserAdmin):
    list_display = ("username", "email", "public_id", "must_change_password", "is_staff", "is_active", "date_joined")
    list_filter = ("is_staff", "is_active", "date_joined")
    search_fields = ("public_id", "username", "email")
    ordering = ("-date_joined",)
    readonly_fields = ("public_id", "date_joined", "last_login", "created_at")
    fieldsets = UserAdmin.fieldsets + (("Seomtorch identity", {"fields": ("public_id", "created_at", "must_change_password")}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Contact", {"fields": ("email",)}),)
