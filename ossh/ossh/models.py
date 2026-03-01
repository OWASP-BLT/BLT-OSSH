import logging
from django.db import models
from django.contrib.auth.models import User

logger = logging.getLogger(__name__)


class OsshCommunity(models.Model):
    """
    Represents an open source community.
    Stores information about communities related to open source projects.
    """
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, null=True)
    url = models.URLField(blank=True, null=True)
    tags = models.ManyToManyField('Tag', related_name='ossh_communities', blank=True)
    metadata = models.JSONField(default=dict, help_text="Additional metadata like primary_language, etc.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'OSSH Community'
        verbose_name_plural = 'OSSH Communities'
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class OsshDiscussionChannel(models.Model):
    """
    Represents a discussion channel (Discord, Slack, etc.) for open source communities.
    """
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    platform = models.CharField(
        max_length=50,
        choices=[
            ('discord', 'Discord'),
            ('slack', 'Slack'),
            ('matrix', 'Matrix'),
            ('irc', 'IRC'),
            ('other', 'Other'),
        ],
        default='discord'
    )
    url = models.URLField(blank=True, null=True)
    tags = models.ManyToManyField('Tag', related_name='ossh_discussion_channels', blank=True)
    community = models.ForeignKey(
        OsshCommunity,
        on_delete=models.CASCADE,
        related_name='discussion_channels',
        null=True,
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'OSSH Discussion Channel'
        verbose_name_plural = 'OSSH Discussion Channels'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.platform})"


class OsshArticle(models.Model):
    """
    Represents an article or resource related to open source projects.
    """
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    url = models.URLField()
    tags = models.ManyToManyField('Tag', related_name='ossh_articles', blank=True)
    author = models.CharField(max_length=255, blank=True, null=True)
    published_date = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'OSSH Article'
        verbose_name_plural = 'OSSH Articles'
        ordering = ['-published_date', '-created_at']

    def __str__(self):
        return self.title


class Tag(models.Model):
    """
    Tag model for categorizing OSSH resources (communities, channels, articles).
    This is separate from the main BLT Tag model to keep OSSH isolated.
    """
    name = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'OSSH Tag'
        verbose_name_plural = 'OSSH Tags'
        ordering = ['name']

    def __str__(self):
        return self.name
