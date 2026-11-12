from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("monetization", "0004_remove_legacy_free_plans"),
    ]

    operations = [
        migrations.AddField(
            model_name="planconfig",
            name="limited_access_days",
            field=models.PositiveSmallIntegerField(
                default=14,
                help_text="Number of days university students receive limited access after registration (1–365).",
                validators=[MinValueValidator(1), MaxValueValidator(365)],
            ),
        ),
    ]
