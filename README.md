# OSSH (Open Source Sorting Hat)

## Overview

OSSH is a Django app that provides intelligent recommendation features for open source projects, communities, discussion channels, and learning resources. It uses a user's GitHub profile data to recommend relevant repositories, communities, discussion channels, and articles based on their programming language preferences and topic interests.

## Features

- **Repository Recommendations**: Suggests open source repositories based on user's language and topic preferences using the BLT REST API
- **Community Recommendations**: Recommends open source communities aligned with user interests
- **Discussion Channel Recommendations**: Suggests relevant Discord, Slack, and other discussion channels
- **Article Recommendations**: Recommends learning resources and articles based on user tags
- **Smart Tagging**: Uses intelligent tag normalization and matching to understand user preferences
- **Rate Limiting**: Includes built-in rate limiting to prevent abuse
- **Caching**: Uses Django's cache framework for improved performance

## Installation

The OSSH app is installed as a standalone Django app at the project root.

### Configuration

Add the following to your Django settings:

```python
# Add BLT-OSSH to Python path
import sys
import os
OSSH_PATH = os.path.dirname(BASE_DIR)
if OSSH_PATH not in sys.path:
    sys.path.insert(0, OSSH_PATH)

# Install app
INSTALLED_APPS = [
    # ...
    'ossh',
    # ...
]

# Configure OSSH API endpoint
BLT_API_BASE_URL = os.environ.get("BLT_API_BASE_URL", "http://localhost:8000/api/v1")
```

### URL Configuration

Include OSSH URLs in your project's URL configuration:

```python
from django.urls import path, include

urlpatterns = [
    # ...
    path('ossh/', include('ossh.urls')),
    # ...
]
```

## Models

### Tag
Stores tags used for categorizing OSSH resources.

- `name`: Unique tag name
- `slug`: URL-friendly slug
- `created_at`: Creation timestamp

### OsshCommunity
Represents an open source community.

- `name`: Community name
- `description`: Community description
- `url`: Community URL
- `tags`: M2M relationship to tags
- `metadata`: JSON field for additional data (e.g., primary_language)
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

### OsshDiscussionChannel
Represents a discussion channel for communities.

- `name`: Channel name
- `description`: Channel description
- `platform`: Type of platform (Discord, Slack, etc.)
- `url`: Channel URL
- `community`: FK to OsshCommunity
- `tags`: M2M relationship to tags
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

### OsshArticle
Represents a learning resource or article.

- `title`: Article title
- `description`: Article description
- `url`: Article URL
- `author`: Author name
- `published_date`: Publication date
- `tags`: M2M relationship to tags
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

## Views and Endpoints

### Web Views

- `ossh_home`: Main OSSH home page (GET)
- `ossh_results`: Results page for a GitHub user (POST)

### API Endpoints

- `GET /ossh/` - OSSH home page
- `POST /ossh/results/` - Show results page
- `POST /ossh/api/github-data/` - Fetch and process GitHub user data
- `POST /ossh/api/recommended-repos/` - Get recommended repositories
- `POST /ossh/api/recommended-communities/` - Get recommended communities
- `POST /ossh/api/recommended-channels/` - Get recommended discussion channels
- `POST /ossh/api/recommended-articles/` - Get recommended articles

## Recommendations Algorithm

### Repository Recommender

The `repo_recommender()` function uses the BLT REST API to:

1. Fetch repositories matching user's languages and tags via `/api/v1/repos/?tags=...&language=...`
2. Calculate relevance scores based on:
   - Tag matching (sum of tag weights from user profile)
   - Language matching (percentage weight of user's programming languages)
3. Sort by relevance score and return top 5 repositories

### Community/Article/Channel Recommenders

These functions use a similar approach but query local OSSH models instead of the REST API:

1. Query relevant communities/articles/channels by tags
2. Calculate relevance scores
3. Return sorted recommendations

## Usage Example

```python
from ossh.views import repo_recommender, community_recommender

# Prepare user data
user_tags = [('python', 10), ('django', 8), ('web development', 5)]
language_weights = {'python': 60.0, 'javascript': 30.0, 'typescript': 10.0}

# Get recommendations
repos = repo_recommender(user_tags, language_weights)
communities = community_recommender(user_tags, language_weights)

# Each recommendation includes:
# {
#     'repo': {...},  # Repository data from API or model instance
#     'relevance_score': 25.5,
#     'reasoning': 'Matching tags: python, django | Matching language: python'
# }
```

## Admin Interface

OSSH models are registered in Django admin for easy management:

- **Tags**: Manage tags with slug auto-generation
- **Communities**: Manage communities with their tags and metadata
- **Discussion Channels**: Manage channels with platform selection
- **Articles**: Manage articles with publication dates and tags

## Rate Limiting

The OSSH app includes rate limiting protection on API endpoints:

- `ossh_home`: 10 requests per 60 seconds
- Repository/Community/Article endpoints: 20 requests per 60 seconds

Rate limits are enforced per IP address and include HTTP headers:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `Retry-After`

## API Configuration

The app uses Django's `requests` library to call external APIs. Configure the BLT API URL:

```python
# In settings.py
BLT_API_BASE_URL = "https://api.blt.example.com/api/v1"
```

## Running Tests

```bash
python manage.py test ossh
```

## Contributing

When modifying OSSH models:

1. Update the model in `ossh/models.py`
2. Create and run migrations: `python manage.py makemigrations ossh`
3. Apply migrations: `python manage.py migrate`
4. Update tests in `ossh/tests.py`

## License

Same as the BLT project.
