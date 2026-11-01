from datetime import timedelta

from django.db import migrations
from django.db.models import Sum
from django.utils import timezone


def reconcile_stats(apps, schema_editor):
    Stats = apps.get_model("learning", "UserStats")
    Attempt = apps.get_model("learning", "Attempt")
    ChallengeParticipant = apps.get_model("learning", "ChallengeParticipant")

    for stats in Stats.objects.all().iterator():
        attempts = Attempt.objects.filter(user_id=stats.user_id)
        answer_xp = attempts.filter(is_correct=True).aggregate(total=Sum("xp_earned"))["total"] or 0
        challenge_xp = ChallengeParticipant.objects.filter(
            user_id=stats.user_id,
            bonus_awarded_at__isnull=False,
        ).aggregate(total=Sum("bonus_xp"))["total"] or 0
        dates = sorted({timezone.localdate(value) for value in attempts.values_list("answered_at", flat=True)})

        best_streak = current_streak = 0
        previous = None
        run = 0
        for study_date in dates:
            run = run + 1 if previous and study_date == previous + timedelta(days=1) else 1
            best_streak = max(best_streak, run)
            previous = study_date
        if dates:
            study_date = dates[-1]
            current_streak = 1
            while study_date - timedelta(days=current_streak) in dates:
                current_streak += 1

        stats.xp = answer_xp + challenge_xp
        stats.last_study_date = dates[-1] if dates else None
        stats.current_streak = current_streak
        stats.best_streak = best_streak
        stats.save(update_fields=("xp", "last_study_date", "current_streak", "best_streak"))


class Migration(migrations.Migration):
    dependencies = [("learning", "0008_populate_all_subjects")]

    operations = [migrations.RunPython(reconcile_stats, migrations.RunPython.noop)]
