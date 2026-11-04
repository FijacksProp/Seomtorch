from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0012_emailchangerequest")]

    operations = [
        # Existing two-code requests retain their true quota cost. New requests cost one.
        migrations.AddField(model_name="emailchangerequest", name="code_email_count", field=models.PositiveSmallIntegerField(default=2, db_default=2)),
        migrations.AlterField(model_name="emailchangerequest", name="code_email_count", field=models.PositiveSmallIntegerField(default=1, db_default=2)),
        migrations.AlterField(model_name="emailchangerequest", name="old_code_hash", field=models.CharField(max_length=64, blank=True, default="")),
    ]
