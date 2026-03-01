# OSSH Extraction & Migration Guide

## Overview

The OSSH (Open Source Sorting Hat) recommendation engine has been successfully extracted from the BLT website app into a standalone Django app located at `/BLT-OSSH/ossh/`.

## What Was Done

### 1. Created Standalone OSSH Django App
- **Location**: `/BLT-OSSH/ossh/`
- **App Name**: `ossh`
- **Configuration**: `OsshConfig` in `apps.py`

### 2. Created OSSH Models
Moved and created three core models in `ossh/models.py`:

#### OsshCommunity
Represents open source communities with:
- Name, description, URL
- Tags (M2M relationship)
- Metadata (JSON field for additional data like primary_language)
- Timestamps (created_at, updated_at)

#### OsshDiscussionChannel
Represents discussion channels (Discord, Slack, etc.) with:
- Name, description, platform type
- Tags (M2M relationship)
- Foreign key to OsshCommunity
- Timestamps

#### OsshArticle
Represents learning resources and articles with:
- Title, description, URL
- Author and publication date
- Tags (M2M relationship)
- Timestamps

#### Tag
OSSH-specific tags for categorizing resources with:
- Name, slug
- Created timestamp

### 3. Refactored Recommendation Engine

#### Key Change: REST API Integration
The `repo_recommender()` function now uses the BLT REST API instead of direct database queries:

**Before**:
```python
repos = Repo.objects.filter(Q(primary_language__in=language_list) | Q(tags__name__in=tag_names))
```

**After**:
```python
# Build API query with tags and languages
api_url = f"{BLT_API_BASE_URL}/repos/"
params = {
    'tags': ",".join(tag_names) if tag_names else "",
    'language': ",".join(language_list) if language_list else ""
}
response = requests.get(api_url, params=params, timeout=10)
```

#### API Endpoint Configuration
- Set via environment variable: `BLT_API_BASE_URL`
- Default: `http://localhost:8000/api/v1`
- Used in recommendation queries: `/api/v1/repos/?tags=...&language=...`

#### Benefits
- Decouples OSSH from website database
- Enables scaling recommendation engine independently
- Allows REST API integration with external services
- Better error handling and timeout management

### 4. Moved Views & Utilities

**Files Created**:
- `views.py`: All recommendation view functions
  - `ossh_home()` - Main page
  - `ossh_results()` - Results page
  - `get_github_data()` - GitHub data fetching
  - `get_recommended_repos()` - Repository recommendations (uses REST API)
  - `get_recommended_communities()` - Community recommendations
  - `get_recommended_discussion_channels()` - Channel recommendations
  - `get_recommended_articles()` - Article recommendations

- `constants.py`: Tag normalization and technology lists
- `utils.py`: Utility functions for recommendations
- `forms.py`: Django forms for admin/model creation
- `serializers.py`: DRF serializers for potential REST API
- `tests.py`: Basic test structure

### 5. Created Migrations

**File**: `ossh/migrations/0001_initial.py`
- Creates Tag model
- Creates OsshCommunity model
- Creates OsshDiscussionChannel model
- Creates OsshArticle model

### 6. Updated BLT Settings & URLs

#### settings.py Changes
1. Added BLT-OSSH to Python path:
```python
OSSH_PATH = os.path.dirname(BASE_DIR)
if OSSH_PATH not in sys.path:
    sys.path.insert(0, OSSH_PATH)
```

2. Added ossh to INSTALLED_APPS:
```python
INSTALLED_APPS = (
    # ...
    "ossh",
    # ...
)
```

3. Added API configuration:
```python
BLT_API_BASE_URL = os.environ.get("BLT_API_BASE_URL", "http://localhost:8000/api/v1")
```

#### urls.py Changes
Added OSSH URL routing:
```python
path("ossh/", include("ossh.urls")),
```

## Directory Structure

```
BLT-OSSH/
├── ossh/                      # Django app
│   ├── migrations/
│   │   ├── __init__.py
│   │   └── 0001_initial.py   # Initial migrations
│   ├── __init__.py            # App exports
│   ├── admin.py               # Django admin configuration
│   ├── apps.py                # App configuration
│   ├── constants.py           # Tag lists and normalization
│   ├── forms.py               # Django forms
│   ├── models.py              # Data models
│   ├── serializers.py         # DRF serializers
│   ├── tests.py               # Tests
│   ├── urls.py                # URL routing
│   ├── utils.py               # Utility functions
│   ├── views.py               # View functions
│   └── README.md              # App documentation
├── LICENSE
└── README.md
```

## Setup Instructions

### 1. Apply Migrations
```bash
# From BLT project root
python manage.py migrate ossh
```

### 2. Configure Environment (Optional)
```bash
# Set custom API base URL if needed
export BLT_API_BASE_URL="https://api.blt.example.com/api/v1"
```

### 3. Access Admin Interface
- Navigate to `/admin/`
- Manage:
  - OSSH Tags
  - Communities
  - Discussion Channels
  - Articles

### 4. Access OSSH Views
- Home page: `/ossh/`
- Results: `/ossh/results/`
- APIs: See `/ossh/urls.py` for endpoints

## API Endpoints

### Web Views
- `GET /ossh/` → Home page
- `POST /ossh/results/` → Results page for GitHub user

### Internal APIs (Rate Limited)
- `POST /ossh/api/github-data/` → Fetch GitHub user data
- `POST /ossh/api/recommended-repos/` → Get repo recommendations
- `POST /ossh/api/recommended-communities/` → Get community recommendations
- `POST /ossh/api/recommended-channels/` → Get channel recommendations
- `POST /ossh/api/recommended-articles/` → Get article recommendations

Rate Limits:
- `github-data`: 10 requests/60 seconds
- Others: 20 requests/60 seconds

## Key Features

### 1. Smart Recommendations
- Uses GitHub profile analysis
- Normalizes tags and technology names
- Calculates relevance scores
- Returns top recommendations

### 2. REST API Integration
- Queries BLT repos via `/api/v1/repos/`
- Supports tag and language filtering
- Handles API errors gracefully

### 3. Rate Limiting
- IP-based rate limiting
- Configurable per endpoint
- Returns HTTP 429 when exceeded

### 4. Caching
- Caches GitHub user data
- Configurable timeout (default: 3600 seconds)

### 5. Admin Interface
- Full Django admin support
- Tag slug auto-generation
- Bulk editing capabilities

## Database Models

### Relationships
```
Tag (1) ─── (M) OsshCommunity
         └── (M) OsshDiscussionChannel
         └── (M) OsshArticle

OsshCommunity (1) ─── (M) OsshDiscussionChannel
```

### Key Fields
- **All Models**: `created_at`, `updated_at` timestamps
- **Communities**: JSON metadata for extensibility
- **Channels**: Platform selection (Discord, Slack, etc.)
- **Articles**: Publication date and author

## Configuration Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BLT_API_BASE_URL` | `http://localhost:8000/api/v1` | Base URL for BLT REST API |
| `CACHE_TIMEOUT` | `3600` | GitHub data cache duration (seconds) |
| `MAX_REQUEST_SIZE` | `10240` | Max request size (bytes) |
| `MIN_LANGUAGE_PERCENTAGE` | `5` | Min language weight to include |

## Testing

```bash
# Run all OSSH tests
python manage.py test ossh

# Run specific test class
python manage.py test ossh.tests.OsshModelTestCase

# Run with verbosity
python manage.py test ossh -v 2
```

## Migration from Old Structure

### What Needs to Be Updated

If you have existing code referencing the old website OSSH views:

**Old Import**:
```python
from website.views.ossh import repo_recommender, get_recommended_repos
```

**New Import**:
```python
from ossh.views import repo_recommender, get_recommended_repos
```

**Old Models**:
```python
from website.models import OsshCommunity, OsshDiscussionChannel, OsshArticle
```

**New Models**:
```python
from ossh.models import OsshCommunity, OsshDiscussionChannel, OsshArticle
```

### Optional: Remove Old Files

Once migration is complete and tested, you can optionally remove:
- `website/views/ossh.py` (functionality moved to `ossh/views.py`)
- References to OSSH models from `website/models.py`

## Troubleshooting

### Import Errors
If you get "ModuleNotFoundError: No module named 'ossh'":
- Ensure BLT-OSSH is alongside BLT directory
- Verify settings.py includes the sys.path.insert() for OSSH_PATH
- Restart Django development server

### API Connection Issues
If recommendations fail with API errors:
- Check `BLT_API_BASE_URL` is set correctly
- Verify BLT API is running: `curl {BLT_API_BASE_URL}/repos/`
- Check timeout settings (default 10 seconds)
- Review error logs for details

### Migration Issues
If migration fails:
```bash
# Check migration status
python manage.py showmigrations ossh

# Create new migration if models changed
python manage.py makemigrations ossh
```

## Future Enhancements

Potential improvements:
1. Add recommendation caching (not just GitHub data)
2. Create REST API endpoints for recommendations
3. Add machine learning for better scoring
4. Implement A/B testing for recommendation algorithms
5. Add user feedback mechanism for recommendation quality
6. Create admin dashboard with recommendation analytics

## Support

For issues or questions:
1. Check the `ossh/README.md` for detailed documentation
2. Review test cases in `ossh/tests.py` for examples
3. Check BLT repository issues on GitHub
