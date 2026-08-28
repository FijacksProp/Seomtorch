from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("learning", "0005_challengeparticipant_abandoned_and_hidden")]

    operations = [
        migrations.AlterField(
            model_name="question",
            name="explanation",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="question",
            name="explanation_status",
            field=models.CharField(choices=[("missing", "Pending explanation"), ("source_unreviewed", "Source explanation (unreviewed)"), ("reviewed", "Reviewed")], default="reviewed", max_length=24),
        ),
        migrations.AddField(model_name="question", name="explanation_image_url", field=models.CharField(blank=True, default="", max_length=500)),
        migrations.AddField(model_name="question", name="quality_flags", field=models.JSONField(blank=True, default=list)),
        migrations.AddField(model_name="question", name="source_url", field=models.URLField(blank=True, default="", max_length=500)),
        migrations.CreateModel(
            name="QuestionBankRelease",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("version", models.CharField(max_length=40, unique=True)),
                ("question_count", models.PositiveIntegerField(default=0)),
                ("imported_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ("-imported_at",)},
        ),
    ]
