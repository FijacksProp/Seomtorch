import os
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

class Command(BaseCommand):
    help = "Create the initial superuser from environment variables when absent."

    def handle(self, *args, **options):
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "").strip().lower()
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME", "").strip()
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "")
        reset_password = os.environ.get("DJANGO_SUPERUSER_RESET_PASSWORD", "False").strip().lower() in {"1", "true", "yes", "on"}
        if not all((email, username, password)):
            self.stdout.write("Initial superuser variables are not all set; skipping.")
            return
        User = get_user_model()
        user, created = User.objects.get_or_create(email=email, defaults={"username": username, "is_staff": True, "is_superuser": True})
        if created:
            user.set_password(password); user.save(update_fields=("password",))
            self.stdout.write(self.style.SUCCESS(f"Created initial superuser {email}."))
        else:
            changed = False
            if not user.is_staff or not user.is_superuser:
                user.is_staff = user.is_superuser = True; changed = True
            update_fields = ["is_staff", "is_superuser"] if changed else []
            if reset_password:
                user.set_password(password)
                update_fields.append("password")
            if update_fields: user.save(update_fields=update_fields)
            if reset_password:
                self.stdout.write(self.style.WARNING(f"Reset the password for initial superuser {email}. Remove DJANGO_SUPERUSER_RESET_PASSWORD now."))
                return
            self.stdout.write(f"Initial superuser {email} already exists.")
