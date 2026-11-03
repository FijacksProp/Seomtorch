from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("accounts", "0008_buddy_messages_and_student_feedback")]

    operations = [
        migrations.CreateModel(
            name="FeedbackPromptState",
            fields=[
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name="feedback_prompt_state", serialize=False, to=settings.AUTH_USER_MODEL)),
                ("next_test_count", models.PositiveIntegerField(default=3)),
                ("last_prompt_at", models.DateTimeField(blank=True, null=True)),
                ("last_prompt_session", models.UUIDField(blank=True, null=True)),
            ],
        ),
    ]
