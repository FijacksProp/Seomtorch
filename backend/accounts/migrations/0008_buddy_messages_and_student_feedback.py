import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("accounts", "0007_studentfollow")]

    operations = [
        migrations.CreateModel(
            name="StudentBlock",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("blocker", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="student_blocks", to=settings.AUTH_USER_MODEL)),
                ("blocked", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="blocked_by_students", to=settings.AUTH_USER_MODEL)),
            ],
            options={"constraints": [
                models.UniqueConstraint(fields=("blocker", "blocked"), name="unique_student_block_pair"),
                models.CheckConstraint(condition=~models.Q(blocker=models.F("blocked")), name="no_self_student_block"),
            ]},
        ),
        migrations.CreateModel(
            name="BuddyMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("client_id", models.UUIDField(default=uuid.uuid4)),
                ("body", models.TextField(max_length=2000)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("sender", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sent_buddy_messages", to=settings.AUTH_USER_MODEL)),
                ("recipient", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="received_buddy_messages", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ("id",),
                "constraints": [
                    models.UniqueConstraint(fields=("sender", "client_id"), name="unique_sender_message_client"),
                    models.CheckConstraint(condition=~models.Q(sender=models.F("recipient")), name="no_self_buddy_message"),
                ],
                "indexes": [
                    models.Index(fields=["sender", "recipient", "id"], name="buddy_dialog_out_idx"),
                    models.Index(fields=["recipient", "sender", "id"], name="buddy_dialog_in_idx"),
                    models.Index(fields=["recipient", "read_at"], name="buddy_unread_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="StudentFeedback",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("client_id", models.UUIDField(default=uuid.uuid4)),
                ("category", models.CharField(choices=[("general", "General feedback"), ("improvement", "Suggest an improvement"), ("bug", "Report a problem"), ("safety", "Message safety report")], default="general", max_length=20)),
                ("body", models.TextField(max_length=4000)),
                ("status", models.CharField(choices=[("new", "Received"), ("reviewing", "Under review"), ("done", "Reviewed")], default="new", max_length=16)),
                ("admin_note", models.TextField(blank=True, max_length=2000)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="feedback_submissions", to=settings.AUTH_USER_MODEL)),
                ("reported_message", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="safety_reports", to="accounts.buddymessage")),
            ],
            options={
                "ordering": ("-created_at",),
                "constraints": [
                    models.UniqueConstraint(fields=("user", "client_id"), name="unique_student_feedback_client"),
                    models.UniqueConstraint(fields=("user", "reported_message"), name="unique_feedback_message_report"),
                ],
                "indexes": [models.Index(fields=["status", "-created_at"], name="student_feedback_inbox_idx")],
            },
        ),
    ]
