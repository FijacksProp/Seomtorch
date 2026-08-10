from django.contrib.auth import logout
from rest_framework import permissions, status, throttling
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from learning.models import ActivityEvent, UserStats
from .serializers import LoginSerializer, RegisterSerializer, UserSerializer

class AuthThrottle(throttling.AnonRateThrottle):
    scope = "auth"

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        UserStats.objects.get_or_create(user=user)
        token = Token.objects.create(user=user)
        ActivityEvent.objects.create(user=user, event_type=ActivityEvent.Type.REGISTERED)
        return Response({"token": token.key, "user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        ActivityEvent.objects.create(user=user, event_type=ActivityEvent.Type.SIGNED_IN)
        return Response({"token": token.key, "user": UserSerializer(user).data})

class LogoutView(APIView):
    def post(self, request):
        ActivityEvent.objects.create(user=request.user, event_type=ActivityEvent.Type.SIGNED_OUT)
        request.auth.delete()
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)

class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)
