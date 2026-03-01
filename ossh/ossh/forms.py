from django import forms
from .models import OsshCommunity, OsshDiscussionChannel, OsshArticle


class OsshCommunityForm(forms.ModelForm):
    class Meta:
        model = OsshCommunity
        fields = ['name', 'description', 'url', 'tags', 'metadata']


class OsshDiscussionChannelForm(forms.ModelForm):
    class Meta:
        model = OsshDiscussionChannel
        fields = ['name', 'description', 'platform', 'url', 'tags', 'community']


class OsshArticleForm(forms.ModelForm):
    class Meta:
        model = OsshArticle
        fields = ['title', 'description', 'url', 'author', 'published_date', 'tags']
