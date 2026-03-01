from django.contrib import admin
from .models import OsshCommunity, OsshDiscussionChannel, OsshArticle, Tag


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'created_at')
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created_at',)


@admin.register(OsshCommunity)
class OsshCommunityAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at', 'updated_at')
    search_fields = ('name', 'description')
    filter_horizontal = ('tags',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(OsshDiscussionChannel)
class OsshDiscussionChannelAdmin(admin.ModelAdmin):
    list_display = ('name', 'platform', 'community', 'created_at')
    search_fields = ('name', 'description', 'platform')
    filter_horizontal = ('tags',)
    list_filter = ('platform', 'created_at')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(OsshArticle)
class OsshArticleAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'published_date', 'created_at')
    search_fields = ('title', 'description', 'author')
    filter_horizontal = ('tags',)
    list_filter = ('published_date', 'created_at')
    readonly_fields = ('created_at', 'updated_at')
