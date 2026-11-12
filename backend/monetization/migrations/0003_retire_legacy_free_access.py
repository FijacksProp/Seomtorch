from django.db import migrations


def retire_legacy_grants(apps, schema_editor):
    CourseAccess = apps.get_model("monetization", "CourseAccess")
    PaymentTransaction = apps.get_model("monetization", "PaymentTransaction")
    DiscountCode = apps.get_model("monetization", "DiscountCode")
    paid_references = PaymentTransaction.objects.filter(status="success").values_list("reference", flat=True)

    # Keep every row for auditability. Retain verified all-access payment grants;
    # revoke trials, pilot/manual grants, and the retired single-course plan.
    CourseAccess.objects.filter(access_type="trial").update(is_active=False)
    CourseAccess.objects.filter(granted_by="trial").update(is_active=False)
    CourseAccess.objects.filter(granted_by="admin_manual", reference__in=paid_references).update(granted_by="payment")
    CourseAccess.objects.filter(granted_by="admin_manual").exclude(reference__in=paid_references).update(is_active=False)
    CourseAccess.objects.exclude(access_type="all_access").update(is_active=False)
    DiscountCode.objects.filter(is_active=True).update(is_active=False)


def restore_noop(apps, schema_editor):
    # Intentionally irreversible: a rollback must never silently re-enable old
    # free access. Grant rows remain in the database for manual audit/recovery.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("monetization", "0002_planconfig_screenshot_protection_enabled"),
    ]

    operations = [
        migrations.RunPython(retire_legacy_grants, restore_noop),
    ]
