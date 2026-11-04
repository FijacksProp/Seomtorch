from django.conf import settings


class SecurityHeadersMiddleware:
    """Add conservative browser protections to Django pages and API responses."""

    CONTENT_SECURITY_POLICY = (
        "default-src 'self'; "
        "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; "
        "form-action 'self' https://checkout.paystack.com https://*.paystack.co; "
        "script-src 'self' 'unsafe-inline' https://js.paystack.co https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self' https://api.paystack.co https://*.paystack.co; "
        "frame-src https://checkout.paystack.com https://*.paystack.co; "
        "media-src 'self' data: blob: https:; upgrade-insecure-requests"
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            response["Cache-Control"] = "no-store, private"
        response["Content-Security-Policy"] = self.CONTENT_SECURITY_POLICY
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if not settings.DEBUG:
            response["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
