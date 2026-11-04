from django import forms
from django.conf import settings
from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.db import transaction
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods

from .email_security import effective_grace_deadline
from .models import AccountSecurityPolicy, AccountSecurityPolicyChange, User


class GraceDeadlineForm(forms.Form):
    grace_until = forms.DateTimeField(
        label="Grace deadline · Lagos time (UTC+1)",
        input_formats=["%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"],
        widget=forms.DateTimeInput(format="%Y-%m-%dT%H:%M:%S", attrs={"type": "datetime-local", "step": "1"}),
    )
    reason = forms.CharField(max_length=240, min_length=5, strip=True,
        label="Reason for this change", widget=forms.Textarea(attrs={"rows": 3, "placeholder": "For example: extend the rollout while students resolve inbox access."}))
    expected_version = forms.IntegerField(min_value=0, widget=forms.HiddenInput)
    confirm = forms.BooleanField(required=False)


@staff_member_required
@never_cache
@require_http_methods(["GET", "POST"])
@timezone.override("Africa/Lagos")
def account_security_settings(request):
    policy = AccountSecurityPolicy.objects.filter(pk=1).first()
    before = policy.grace_until if policy else effective_grace_deadline()
    version = policy.version if policy else 0
    form = GraceDeadlineForm(request.POST if request.method == "POST" else None,
        initial={"grace_until": before, "expected_version": version})
    reviewing = False
    status = 200
    if request.method == "POST":
        if form.is_valid():
            action = request.POST.get("action")
            if action == "save":
                if not form.cleaned_data["confirm"]:
                    form.add_error("confirm", "Confirm the impact before saving this deadline.")
                    reviewing = True
                    status = 400
                else:
                    with transaction.atomic():
                        # Unique singleton key + a locked revision prevents lost admin updates.
                        row, _ = AccountSecurityPolicy.objects.get_or_create(pk=1,
                            defaults={"grace_until": before or form.cleaned_data["grace_until"]})
                        row = AccountSecurityPolicy.objects.select_for_update().get(pk=row.pk)
                        if row.version != form.cleaned_data["expected_version"]:
                            form.add_error(None, "Another administrator changed this deadline. Reload the current settings before reviewing your change again.")
                            status = 409
                        else:
                            AccountSecurityPolicyChange.objects.create(previous_deadline=before if row.version == 0 else row.grace_until,
                                new_deadline=form.cleaned_data["grace_until"], reason=form.cleaned_data["reason"], changed_by=request.user)
                            row.grace_until = form.cleaned_data["grace_until"]
                            row.version += 1
                            row.updated_by = request.user
                            row.save(update_fields=("grace_until", "version", "updated_by", "updated_at"))
                            messages.success(request, "Grace deadline updated. All servers use the new deadline immediately; no redeploy is needed.")
                            return redirect("monitor:account-security")
            elif action == "review":
                reviewing = True
            elif action != "edit":
                form.add_error(None, "Choose Review change before saving.")
                status = 400
        else:
            status = 400
    context = {
        "form": form, "reviewing": reviewing, "deadline": before,
        "proposed": form.cleaned_data.get("grace_until") if form.is_bound else None,
        "security_enabled": settings.ACCOUNT_SECURITY_ENABLED, "policy": policy,
        "unverified_students": User.objects.filter(is_staff=False, email_verified_at__isnull=True, is_active=True).count(),
        "grace_open": bool(before and before > timezone.now()),
        "changes": AccountSecurityPolicyChange.objects.select_related("changed_by")[:20],
    }
    return render(request, "monitor/account_security.html", context, status=status)
