from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("learning", "0004_badgedefinition_alter_activityevent_event_type_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="activityevent",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("registered", "Registered"),
                    ("signed_in", "Signed in"),
                    ("signed_out", "Signed out"),
                    ("session_started", "Session started"),
                    ("session_completed", "Session completed"),
                    ("answered", "Question answered"),
                    ("bookmarked", "Question bookmarked"),
                    ("badge_earned", "Badge earned"),
                    ("challenge_created", "Challenge created"),
                    ("challenge_responded", "Challenge responded"),
                    ("challenge_completed", "Challenge completed"),
                    ("challenge_abandoned", "Challenge abandoned"),
                ],
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="challengeparticipant",
            name="status",
            field=models.CharField(
                choices=[
                    ("invited", "Invited"),
                    ("accepted", "Accepted"),
                    ("declined", "Declined"),
                    ("started", "Started"),
                    ("completed", "Completed"),
                    ("abandoned", "Abandoned"),
                ],
                default="invited",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="challengeparticipant",
            name="hidden_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
