"""Utility functions for the OSSH (Open Source Sorting Hat) recommendation engine."""

import logging

logger = logging.getLogger(__name__)


def build_api_query(tags=None, languages=None):
    """
    Build query parameters for the BLT REST API based on tags and languages.
    
    Args:
        tags: List of tag names
        languages: List of programming languages
        
    Returns:
        Dictionary of query parameters
    """
    params = {}
    
    if tags:
        params['tags'] = ",".join(tags)
    
    if languages:
        params['language'] = ",".join(languages)
    
    return params


def calculate_relevance_score(repo_tags, repo_language, user_tags, language_weights):
    """
    Calculate a relevance score for a repository based on user preferences.
    
    Args:
        repo_tags: List of tags associated with the repository
        repo_language: Primary language of the repository
        user_tags: Dictionary of user tags with their weights
        language_weights: Dictionary of user languages with their weights
        
    Returns:
        Float representing the relevance score
    """
    tag_weight_map = dict(user_tags) if isinstance(user_tags, list) else user_tags
    
    # Calculate tag score
    tag_score = 0
    if isinstance(repo_tags, list):
        for tag in repo_tags:
            tag_name = tag.get('name') if isinstance(tag, dict) else tag
            tag_score += tag_weight_map.get(tag_name, 0)
    
    # Calculate language score
    language_score = language_weights.get(repo_language, 0) if repo_language else 0
    
    return tag_score + language_score


def get_matching_tags(repo_tags, user_tags):
    """
    Get the intersection of repository tags and user tags.
    
    Args:
        repo_tags: List of repository tags
        user_tags: List of user tags (either strings or tuples with weights)
        
    Returns:
        List of matching tag names
    """
    user_tag_names = set()
    
    if isinstance(user_tags, list):
        for item in user_tags:
            if isinstance(item, tuple):
                user_tag_names.add(item[0])
            else:
                user_tag_names.add(item)
    elif isinstance(user_tags, dict):
        user_tag_names = set(user_tags.keys())
    
    repo_tag_names = set()
    if isinstance(repo_tags, list):
        for tag in repo_tags:
            if isinstance(tag, dict):
                repo_tag_names.add(tag.get('name', ''))
            else:
                repo_tag_names.add(str(tag))
    
    return list(user_tag_names.intersection(repo_tag_names))


def generate_recommendation_reasoning(matching_tags=None, matching_languages=None):
    """
    Generate human-readable reasoning for a recommendation.
    
    Args:
        matching_tags: List of matching tags
        matching_languages: List of matching languages
        
    Returns:
        String describing why the item was recommended
    """
    reasons = []
    
    if matching_tags:
        reasons.append(f"Matching tags: {', '.join(matching_tags)}")
    
    if matching_languages:
        reasons.append(f"Matching language: {', '.join(matching_languages)}")
    
    return " | ".join(reasons) if reasons else "No specific reason"


# --- GitHub / request helpers copied for OSSH (self-contained) ---
import requests
from django.conf import settings


def get_client_ip(request):
    """Return client IP from request, respecting common proxy headers."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        # X-Forwarded-For may contain multiple IPs, the left-most is the original
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def fetch_github_user_data(username, timeout=10):
    """
    Fetch basic GitHub profile repository, language and topic data for a user.

    Returns a dict with keys: 'repositories' (list), 'top_languages' (list of (lang,bytes)),
    and 'top_topics' (list of topic strings).

    This is a pragmatic implementation suitable for recommendation features
    and tolerates partial failures.
    """
    headers = {"Accept": "application/vnd.github.mercy-preview+json"}
    token = getattr(settings, "GITHUB_TOKEN", None)
    if token:
        headers["Authorization"] = f"token {token}"

    session = requests.Session()
    session.headers.update(headers)

    repos = []
    page = 1
    try:
        while True:
            resp = session.get(
                f"https://api.github.com/users/{username}/repos",
                params={"per_page": 100, "page": page},
                timeout=timeout,
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, list) or len(data) == 0:
                break
            for r in data:
                repos.append(
                    {
                        "full_name": r.get("full_name"),
                        "description": r.get("description") or "",
                        "languages_url": r.get("languages_url"),
                        "topics": r.get("topics", []),
                        "primary_language": r.get("language"),
                    }
                )
            if len(data) < 100:
                break
            page += 1
    except requests.RequestException:
        return None

    # Aggregate language bytes across repos
    lang_counts = {}
    for repo in repos:
        url = repo.get("languages_url")
        if not url:
            continue
        try:
            r = session.get(url, timeout=timeout)
            r.raise_for_status()
            langs = r.json()
            if isinstance(langs, dict):
                for lang, bytes_count in langs.items():
                    lang_counts[lang] = lang_counts.get(lang, 0) + int(bytes_count or 0)
        except Exception:
            # ignore per-repo failures
            continue

    top_languages = sorted(lang_counts.items(), key=lambda x: x[1], reverse=True)

    # Collect and rank topics (most common first)
    from collections import Counter

    topic_counter = Counter()
    for repo in repos:
        topics = repo.get("topics") or []
        if isinstance(topics, list):
            topic_counter.update(topics)

    top_topics = [t for t, _ in topic_counter.most_common()]

    return {"repositories": repos, "top_languages": top_languages, "top_topics": top_topics}
