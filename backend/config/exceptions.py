import logging
import uuid

from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        return response

    reference = uuid.uuid4().hex[:8].upper()
    request = context.get("request")
    logger.exception(
        "Unhandled API error [%s] %s %s",
        reference,
        getattr(request, "method", "UNKNOWN"),
        getattr(request, "path", "UNKNOWN"),
        exc_info=exc,
    )
    return Response(
        {"detail": "The server could not complete this request.", "reference": reference},
        status=500,
    )
