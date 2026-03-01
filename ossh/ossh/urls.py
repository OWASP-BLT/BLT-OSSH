from django.urls import path
from .views import (
    ossh_home,
    ossh_results,
    get_github_data,
    get_recommended_repos,
    get_recommended_communities,
    get_recommended_discussion_channels,
    get_recommended_articles,
)

app_name = 'ossh'

urlpatterns = [
    path('', ossh_home, name='ossh_home'),
    path('results/', ossh_results, name='ossh_results'),
    path('api/github-data/', get_github_data, name='get_github_data'),
    path('api/recommended-repos/', get_recommended_repos, name='get_recommended_repos'),
    path('api/recommended-communities/', get_recommended_communities, name='get_recommended_communities'),
    path('api/recommended-channels/', get_recommended_discussion_channels, name='get_recommended_discussion_channels'),
    path('api/recommended-articles/', get_recommended_articles, name='get_recommended_articles'),
]
