from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import UserStats

@receiver(post_save, sender=get_user_model())
def create_user_stats(sender, instance, created, **kwargs):
    if created:
        UserStats.objects.get_or_create(user=instance)
