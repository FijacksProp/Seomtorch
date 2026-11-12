"""Server-authoritative access rules for university questions and course notes."""

from collections import defaultdict

from monetization.access_policy import has_paid_university_access, limited_access_is_active, limited_access_percentage

from .models import Question, Subject, Topic


def free_question_limit(question_count, percentage=20):
    """Expose the configured percentage of a topic's active question bank."""
    return limited_sample_count(question_count, percentage)


def limited_sample_count(total_count, percentage=20):
    """Round a sample up, retaining one item when a non-empty topic is tiny."""
    total_count = max(0, int(total_count or 0))
    percentage = min(100, max(0, int(percentage or 0)))
    return min(total_count, (total_count * percentage + 99) // 100)


def university_full_access(user, subject):
    return bool(subject and subject.track == Subject.Track.UNIVERSITY and has_paid_university_access(user, subject.code))


def accessible_university_question_ids(user, subject, topic=None):
    """Return the stable free sample for one topic or all topics in a course.

    A paid account returns ``None`` to mean the whole question bank is available;
    an expired/unqualified account gets an empty set.
    """
    if not subject or subject.track != Subject.Track.UNIVERSITY:
        return None
    if university_full_access(user, subject):
        return None
    if not limited_access_is_active(user):
        return set()
    percentage = limited_access_percentage(user)

    questions = Question.objects.filter(topic__subject=subject, is_active=True)
    if topic is not None:
        questions = questions.filter(topic=topic)
    rows = questions.order_by("topic_id", "external_id").values_list("topic_id", "external_id")
    grouped = defaultdict(list)
    for topic_id, external_id in rows:
        grouped[topic_id].append(external_id)

    allowed = set()
    for ids in grouped.values():
        allowed.update(ids[:free_question_limit(len(ids), percentage)])
    return allowed


def user_can_access_topic(user, subject, topic):
    if not subject or subject.track != Subject.Track.UNIVERSITY:
        return True
    if university_full_access(user, subject):
        return True
    if not topic:
        return False
    return bool(accessible_university_question_ids(user, subject, topic))


def user_can_access_questions(user, questions):
    """Check a batch efficiently, grouping limited access checks per topic."""
    grouped = defaultdict(list)
    paid_by_subject = {}
    for question in questions:
        subject = question.topic.subject
        if subject.track != Subject.Track.UNIVERSITY:
            continue
        if subject.pk not in paid_by_subject:
            paid_by_subject[subject.pk] = university_full_access(user, subject)
        if paid_by_subject[subject.pk]:
            continue
        grouped[(subject.pk, question.topic_id)].append(question)

    if not grouped:
        return True
    if not limited_access_is_active(user):
        return False

    subjects = {subject.pk: subject for subject in (question.topic.subject for values in grouped.values() for question in values)}
    topics = {question.topic_id: question.topic for values in grouped.values() for question in values}
    for (subject_id, topic_id), items in grouped.items():
        allowed = accessible_university_question_ids(user, subjects[subject_id], topics[topic_id]) or set()
        if any(item.external_id not in allowed for item in items):
            return False
    return True


def user_can_access_question(user, question):
    return user_can_access_questions(user, [question])
