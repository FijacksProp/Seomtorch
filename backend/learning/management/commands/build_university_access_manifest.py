from django.core.management.base import BaseCommand

from learning.content_views import write_content_access_manifest


class Command(BaseCommand):
    help = "Prebuild the university course-content access map before web workers start."

    def handle(self, *args, **options):
        count = write_content_access_manifest()
        self.stdout.write(self.style.SUCCESS(f"University content access manifest ready: {count} content and media paths."))
