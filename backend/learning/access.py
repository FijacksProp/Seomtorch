"""Shared university entitlements for practice and friend challenges."""
from monetization.course_topics import DEFAULT_FREE_TOPICS, canonical_topic_id
from monetization.models import CourseAccess, CourseTopicConfig

from .models import Subject


def free_topic_id(subject):
    configured = CourseTopicConfig.objects.filter(course_code__iexact=subject.code).values_list("free_topic_id", flat=True).first()
    return canonical_topic_id(subject.code, configured or DEFAULT_FREE_TOPICS.get(subject.code.upper(), ""))


def user_can_access_topic(user, subject, topic):
    if subject.track != Subject.Track.UNIVERSITY or CourseAccess.user_has_course_access(user, subject.code):
        return True
    free_id = free_topic_id(subject)
    return bool(topic and free_id and canonical_topic_id(subject.code, topic.slug) == free_id)


def user_can_access_question(user, question):
    return user_can_access_topic(user, question.topic.subject, question.topic)
