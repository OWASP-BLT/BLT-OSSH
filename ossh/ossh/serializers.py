from rest_framework import serializers
from .models import OsshCommunity, OsshDiscussionChannel, OsshArticle, Tag


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name', 'slug', 'created_at']
        read_only_fields = ['id', 'created_at']


class OsshCommunitySerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = OsshCommunity
        fields = ['id', 'name', 'description', 'url', 'tags', 'metadata', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class OsshDiscussionChannelSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    community = OsshCommunitySerializer(read_only=True)

    class Meta:
        model = OsshDiscussionChannel
        fields = ['id', 'name', 'description', 'platform', 'url', 'tags', 'community', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class OsshArticleSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = OsshArticle
        fields = ['id', 'title', 'description', 'url', 'author', 'published_date', 'tags', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
