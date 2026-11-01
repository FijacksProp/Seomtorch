from django.db import migrations, models
from django.db.models import Count


def normalize_sessions(apps, schema_editor):
    PracticeSession = apps.get_model("learning", "PracticeSession")
    sessions = PracticeSession.objects.annotate(
        recorded_answers=Count("attempts", distinct=True),
        verified_correct=Count("attempts", filter=models.Q(attempts__is_correct=True), distinct=True),
    )
    for session in sessions.iterator():
        if session.recorded_answers:
            updates = {"correct_answers": session.verified_correct}
            if session.began_at is None:
                updates["began_at"] = session.started_at
            PracticeSession.objects.filter(pk=session.pk).update(**updates)
        elif session.status == "completed" or session.completed_at is not None:
            # Old clients could submit a fabricated aggregate score without
            # any recorded answers. Keep the row for audit, but exclude it
            # from completed-test metrics and badges.
            PracticeSession.objects.filter(pk=session.pk).update(
                status="abandoned",
                completed_at=None,
                correct_answers=0,
            )


class Migration(migrations.Migration):
    dependencies = [("learning", "0009_reconcile_verified_stats")]

    operations = [
        migrations.AddField(
            model_name="practicesession",
            name="began_at",
            field=models.DateTimeField(blank=True, help_text="When the student actually began the session.", null=True),
        ),
        migrations.RunPython(normalize_sessions, migrations.RunPython.noop),
    ]
