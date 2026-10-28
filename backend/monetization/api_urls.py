from django.urls import path
from .api_views import (
    SubscriptionConfigView,
    ValidateDiscountCodeView,
    InitializePaymentView,
    VerifyPaymentView,
    PaystackWebhookView,
    StartTrialView,
    UserAccessSummaryView,
    LogMonetizationEventView,
)

app_name = "monetization"

urlpatterns = [
    path("config/", SubscriptionConfigView.as_view(), name="config"),
    path("validate-code/", ValidateDiscountCodeView.as_view(), name="validate_code"),
    path("initialize/", InitializePaymentView.as_view(), name="initialize"),
    path("verify/", VerifyPaymentView.as_view(), name="verify"),
    path("paystack-webhook/", PaystackWebhookView.as_view(), name="webhook"),
    path("start-trial/", StartTrialView.as_view(), name="start_trial"),
    path("my-access/", UserAccessSummaryView.as_view(), name="my_access"),
    path("events/", LogMonetizationEventView.as_view(), name="events"),
]
