from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("monetization", "0003_retire_legacy_free_access"),
    ]

    operations = [
        migrations.RemoveField(model_name="planconfig", name="single_course_price"),
        migrations.RemoveField(model_name="planconfig", name="all_access_price"),
        migrations.RemoveField(model_name="planconfig", name="launch_offer_price"),
        migrations.RemoveField(model_name="planconfig", name="launch_offer_active"),
        migrations.RemoveField(model_name="planconfig", name="launch_offer_end_date"),
        migrations.RemoveField(model_name="planconfig", name="launch_offer_max_buyers"),
        migrations.RemoveField(model_name="planconfig", name="launch_offer_buyers_count"),
        migrations.RemoveField(model_name="planconfig", name="trial_duration_days"),
        migrations.DeleteModel(name="CourseTopicConfig"),
    ]
