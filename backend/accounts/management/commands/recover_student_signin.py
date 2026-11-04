from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from knox.models import AuthToken
from rest_framework.authtoken.models import Token
from accounts.models import User, EmailSignInChallenge
from learning.models import ActivityEvent


class Command(BaseCommand):
    help = "After independently confirming ownership, revoke student sign-ins and permit fresh email enrollment."

    def add_arguments(self, parser):
        parser.add_argument("public_id")
        parser.add_argument("--reason", required=True, help="Support ticket reference; never include passwords/codes.")

    @transaction.atomic
    def handle(self, *args, **options):
        user = User.objects.select_for_update().filter(public_id=options["public_id"].upper(), is_staff=False).first()
        if not user:
            raise CommandError("Student not found.")
        user.trusted_browser_hash = ""
        user.save(update_fields=("trusted_browser_hash",))
        AuthToken.objects.filter(user=user).delete()
        Token.objects.filter(user=user).delete()
        EmailSignInChallenge.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=timezone.now())
        ActivityEvent.objects.create(user=user, event_type=ActivityEvent.Type.SIGNED_OUT,
            metadata={"reason": "support_signin_recovery", "ticket": options["reason"][:200]})
        self.stdout.write("Sign-ins revoked. The student must sign in with their password and verify their registered inbox again.")
