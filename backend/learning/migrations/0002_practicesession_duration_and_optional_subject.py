from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("learning", "0001_initial")]

    operations = [
        migrations.AlterField(
            model_name="practicesession",
            name="subject",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="practice_sessions", to="learning.subject"),
        ),
        migrations.AddField(
            model_name="practicesession",
            name="duration_minutes",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
