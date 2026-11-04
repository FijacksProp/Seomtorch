from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from accounts.email_security import send_delivery_test, DeliveryUnavailable


class Command(BaseCommand):
    help = "Send a labelled Brevo delivery test to a consenting recipient; no login code is created."

    def add_arguments(self, parser):
        parser.add_argument("recipient")

    def handle(self, *args, **options):
        try:
            validate_email(options["recipient"])
        except ValidationError:
            raise CommandError("Enter a valid recipient email address.") from None
        try:
            send_delivery_test(options["recipient"])
        except DeliveryUnavailable:
            raise CommandError("Brevo did not accept this send. Check backend credentials, verified sender, sending activation and quota in the Brevo dashboard. No account sign-in was changed.") from None
        self.stdout.write("Brevo accepted the test message. Confirm actual inbox arrival and delivery logs before enabling verification.")
