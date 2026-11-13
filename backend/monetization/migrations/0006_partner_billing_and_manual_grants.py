import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("monetization", "0005_planconfig_limited_access_days"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="planconfig",
            name="all_access_price",
            field=models.PositiveIntegerField(default=3000, help_text="Editable NGN price for full university access for the semester."),
        ),
        migrations.AddField(
            model_name="planconfig",
            name="single_course_price",
            field=models.PositiveIntegerField(default=1500, help_text="Editable NGN price for one university course for the semester."),
        ),
        migrations.CreateModel(
            name="PartnerOrganization",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=180, unique=True)),
                ("slug", models.SlugField(max_length=200, unique=True)),
                ("contact_email", models.EmailField(blank=True, default="", max_length=254)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ("name",), "verbose_name": "Partner institution", "verbose_name_plural": "Partner institutions"},
        ),
        migrations.AddField(
            model_name="discountcode",
            name="partner_organization",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="discount_codes", to="monetization.partnerorganization"),
        ),
        migrations.AlterField(
            model_name="discountcode",
            name="target_plan",
            field=models.CharField(choices=[("all_access", "All-Access Only"), ("single_course", "Single Course Only")], default="all_access", max_length=20),
        ),
        migrations.AlterField(
            model_name="discountcode",
            name="discounted_price",
            field=models.PositiveIntegerField(help_text="Fixed final checkout price in NGN; must be less than the selected plan price."),
        ),
        migrations.AddField(
            model_name="courseaccess",
            name="admin_note",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="courseaccess",
            name="granted_by_user",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="manual_access_grants_created", to=settings.AUTH_USER_MODEL),
        ),
        migrations.CreateModel(
            name="PartnerAdminMembership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("invited_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="partner_admin_invites_sent", to=settings.AUTH_USER_MODEL)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="admins", to="monetization.partnerorganization")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="partner_admin_memberships", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="partneradminmembership",
            constraint=models.UniqueConstraint(fields=("organization", "user"), name="unique_partner_admin_membership"),
        ),
        migrations.AddIndex(
            model_name="partneradminmembership",
            index=models.Index(fields=["user", "is_active"], name="monetizati_user_id_77f584_idx"),
        ),
        migrations.CreateModel(
            name="PartnerStudentMembership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("linked_at", models.DateTimeField(auto_now_add=True)),
                ("discount_code", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="attributed_students", to="monetization.discountcode")),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="students", to="monetization.partnerorganization")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="partner_student_membership", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(
            model_name="partnerstudentmembership",
            index=models.Index(fields=["organization", "linked_at"], name="monetizati_org_id_955201_idx"),
        ),
    ]
