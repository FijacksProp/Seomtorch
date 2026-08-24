from rest_framework import serializers
from .models import Attempt, Bookmark, Question, Subject, Topic, QuestionComment, QuestionReport

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
    passage_id = serializers.UUIDField(source="passage.id", read_only=True, default=None)
    passage_title = serializers.CharField(source="passage.title", read_only=True, default="")
    passage_body = serializers.CharField(source="passage.body", read_only=True, default="")
    video_url = serializers.URLField(read_only=True)
    image_url = serializers.CharField(read_only=True)

    class Meta:
        model = Question
        fields = ("external_id", "subject", "topic", "text", "options", "difficulty", "questionYear", "passage_id", "passage_title", "passage_body", "video_url", "image_url")

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

class QuestionCommentSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    class Meta:
        model = QuestionComment
        fields = ("id", "username", "text", "created_at")

class QuestionReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionReport
        fields = ("id", "reason", "details", "status", "created_at")
