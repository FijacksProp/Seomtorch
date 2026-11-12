from django.urls import path
from .api_views import (
    SubscriptionConfigView,
    InitializePaymentView,
    VerifyPaymentView,
    PaystackWebhookView,
    UserAccessSummaryView,
    LogMonetizationEventView,
)

app_name = "monetization"

urlpatterns = [
    path("config/", SubscriptionConfigView.as_view(), name="config"),
    path("initialize/", InitializePaymentView.as_view(), name="initialize"),
    path("verify/", VerifyPaymentView.as_view(), name="verify"),
    path("paystack-webhook/", PaystackWebhookView.as_view(), name="webhook"),
    path("my-access/", UserAccessSummaryView.as_view(), name="my_access"),
    path("events/", LogMonetizationEventView.as_view(), name="events"),
]
