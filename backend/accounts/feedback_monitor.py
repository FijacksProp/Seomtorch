from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.core.paginator import Paginator
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_POST

from .models import StudentFeedback


@never_cache
@staff_member_required(login_url="/monitor/login/")
def feedback_inbox(request):
    items = StudentFeedback.objects.select_related("user").all()
    status = request.GET.get("status", "")
    category = request.GET.get("category", "")
    query = request.GET.get("q", "").strip()[:100]
    if status in StudentFeedback.Status.values:
        items = items.filter(status=status)
    if category in StudentFeedback.Category.values:
        items = items.filter(category=category)
    if query:
        items = items.filter(Q(user__username__icontains=query) | Q(user__public_id__iexact=query) | Q(body__icontains=query))
    counts = StudentFeedback.objects.aggregate(
        new=Count("id", filter=Q(status=StudentFeedback.Status.NEW)),
        reviewing=Count("id", filter=Q(status=StudentFeedback.Status.REVIEWING)),
        done=Count("id", filter=Q(status=StudentFeedback.Status.DONE)),
    )
    return render(request, "monitor/feedback.html", {
        "page": Paginator(items, 20).get_page(request.GET.get("page")),
        "counts": counts, "statuses": StudentFeedback.Status.choices,
        "categories": StudentFeedback.Category.choices,
        "selected_status": status, "selected_category": category, "query": query,
    })


@never_cache
@staff_member_required(login_url="/monitor/login/")
@require_POST
def update_feedback(request, feedback_id):
    item = get_object_or_404(StudentFeedback, id=feedback_id)
    status = request.POST.get("status")
    note = request.POST.get("admin_note", "").strip()
    if status not in StudentFeedback.Status.values or len(note) > 2000:
        messages.error(request, "Choose a valid status and keep internal notes under 2,000 characters.")
    else:
        item.status, item.admin_note = status, note
        item.save(update_fields=("status", "admin_note", "updated_at"))
        messages.success(request, "Feedback updated. Internal notes remain private to administrators.")
    return redirect("monitor:feedback")
