from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User
from .models import OsshCommunity, OsshDiscussionChannel, OsshArticle, Tag


class OsshModelTestCase(TestCase):
    """Test cases for OSSH models."""

    def setUp(self):
        """Set up test data."""
        self.tag_python = Tag.objects.create(name='python', slug='python')
        self.tag_django = Tag.objects.create(name='django', slug='django')
        
        self.community = OsshCommunity.objects.create(
            name='Django Community',
            description='A community focused on Django development',
            url='https://django.community',
            metadata={'primary_language': 'python'}
        )
        self.community.tags.add(self.tag_python, self.tag_django)

    def test_community_creation(self):
        """Test that a community can be created."""
        self.assertEqual(self.community.name, 'Django Community')
        self.assertEqual(self.community.tags.count(), 2)

    def test_tag_str(self):
        """Test Tag model __str__ method."""
        self.assertEqual(str(self.tag_python), 'python')

    def test_community_str(self):
        """Test OsshCommunity model __str__ method."""
        self.assertEqual(str(self.community), 'Django Community')


class OsshViewsTestCase(TestCase):
    """Test cases for OSSH views."""

    def setUp(self):
        """Set up test client."""
        self.client = Client()

    def test_ossh_home_view(self):
        """Test OSSH home page view."""
        response = self.client.get(reverse('ossh:ossh_home'))
        self.assertEqual(response.status_code, 200)

    def test_ossh_results_get_method(self):
        """Test OSSH results page with GET method returns error."""
        response = self.client.get(reverse('ossh:ossh_results'))
        self.assertEqual(response.status_code, 405)

    def test_get_github_data_no_username(self):
        """Test get_github_data endpoint without username."""
        response = self.client.post(
            reverse('ossh:get_github_data'),
            data={'github_username': ''},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)


class OsshRecommenderTestCase(TestCase):
    """Test cases for recommendation functions."""

    def setUp(self):
        """Set up test data."""
        self.tag_python = Tag.objects.create(name='python', slug='python')
        self.tag_django = Tag.objects.create(name='django', slug='django')

    def test_community_recommender_with_empty_tags(self):
        """Test community recommender with empty user tags."""
        from ossh.views import community_recommender
        
        user_tags = []
        language_weights = {}
        
        recommendations = community_recommender(user_tags, language_weights)
        self.assertEqual(len(recommendations), 0)
