from rest_framework import serializers
from .models import Attempt, Bookmark, Question, Subject, Topic

class TopicSerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(read_only=True)
    class Meta:
        model = Topic
        fields = ("id", "name", "slug", "question_count")

class SubjectSerializer(serializers.ModelSerializer):
    topics = TopicSerializer(many=True, read_only=True)
    question_count = serializers.IntegerField(read_only=True)
    class Meta:
        model = Subject
        fields = ("id", "slug", "name", "description", "question_count", "topics")

class QuestionPracticeSerializer(serializers.ModelSerializer):
    subject = serializers.CharField(source="topic.subject.slug")
    topic = serializers.CharField(source="topic.name")
    questionYear = serializers.IntegerField(source="question_year")
    class Meta:
        model = Question
        fields = ("external_id", "subject", "topic", "text", "options", "difficulty", "questionYear")

class AttemptSerializer(serializers.ModelSerializer):
    question_id = serializers.CharField(source="question.external_id")
    subject = serializers.CharField(source="question.topic.subject.slug")
    topic = serializers.CharField(source="question.topic.name")
    class Meta:
        model = Attempt
        fields = ("client_id", "question_id", "subject", "topic", "selected_index", "is_correct", "xp_earned", "answered_at", "duration_ms")

class BookmarkSerializer(serializers.ModelSerializer):
    question_id = serializers.CharField(source="question.external_id")
    class Meta:
        model = Bookmark
        fields = ("question_id", "created_at")
