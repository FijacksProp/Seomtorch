from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0013_email_change_new_inbox_only")]

    operations = [
        migrations.AlterField(model_name="user", name="email", field=models.EmailField(max_length=254)),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(fields=("email", "user_type"), name="accounts_email_user_type_unique"),
        ),
    ]
