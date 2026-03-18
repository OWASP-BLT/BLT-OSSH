// GitHub API cache: reduces rate limit hits (60 req/hr unauthenticated) and improves load speed.
// Cache expires after 10 minutes; expired entries are removed on read. If localStorage is
// unavailable (private mode, quota exceeded), cache is skipped and API is called normally.
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedData(key) {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        const parsed = JSON.parse(cached);
        if (!parsed || typeof parsed.timestamp !== 'number' || parsed.data === undefined) {
            try { localStorage.removeItem(key); } catch (_) {}
            return null;
        }
        if (Date.now() - parsed.timestamp > CACHE_TTL) {
            try { localStorage.removeItem(key); } catch (_) {}
            return null;
        }
        return parsed.data;
    } catch (err) {
        try { localStorage.removeItem(key); } catch (_) {}
        return null;
    }
}

function setCachedData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (err) {
        console.warn('Cache write failed (storage full or unavailable):', err);
    }
}

// Dark mode toggle
const darkToggle = document.getElementById('dark-toggle');
const html = document.documentElement;

// Check for saved theme preference or default to light mode
const currentTheme = localStorage.getItem('theme') || 'light';
if (currentTheme === 'dark') {
    html.classList.add('dark');
}

darkToggle.addEventListener('click', () => {
    html.classList.toggle('dark');
    const theme = html.classList.contains('dark') ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
});

// Form submission
const form = document.getElementById('ossh-form');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');
const loadingSpinner = document.getElementById('loading-spinner');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const usernameInput = document.getElementById('github-username');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();

    if (!username) {
        showError('Please enter a GitHub username');
        return;
    }

    // Validate username format
    if (username.length > 39 || !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(username)) {
        showError('Please enter a valid GitHub username');
        return;
    }

    // Reset error state
    hideError();

    // Show loading state: disables form and displays "Loading repositories..." while fetching.
    submitBtn.disabled = true;
    btnText.textContent = 'Analyzing...';
    loadingSpinner.classList.remove('hidden');
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'block';

    try {
        // Fetch user profile from GitHub API
        const userResponse = await fetch(
            `https://api.github.com/users/${encodeURIComponent(username)}`,
            { headers: { Accept: 'application/vnd.github+json' } }
        );

        if (userResponse.status === 404) {
            throw new Error('GitHub user not found. Please check the username and try again.');
        }
        if (userResponse.status === 403) {
            throw new Error('GitHub API rate limit exceeded. Please wait a few minutes and try again.');
        }
        if (!userResponse.ok) {
            throw new Error(`GitHub API error (${userResponse.status}). Please try again later.`);
        }

        const userData = await userResponse.json();

        // Repos: check cache first to avoid rate limits and speed up repeat lookups.
        let reposData = getCachedData(`github_repos_${username}`);
        if (!Array.isArray(reposData)) {
            const reposResponse = await fetch(
                `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100`,
                { headers: { Accept: 'application/vnd.github+json' } }
            );
            reposData = reposResponse.ok ? await reposResponse.json() : [];
            if (Array.isArray(reposData)) {
                setCachedData(`github_repos_${username}`, reposData);
            }
        }

        // Events: check cache first. Caching reduces API calls and prevents rate limit errors.
        let eventsData = getCachedData(`github_events_${username}`);
        if (!Array.isArray(eventsData)) {
            try {
                const eventsResponse = await fetch(
                    `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`,
                    { headers: { Accept: 'application/vnd.github+json' } }
                );
                eventsData = eventsResponse.ok ? await eventsResponse.json() : [];
                if (Array.isArray(eventsData)) {
                    setCachedData(`github_events_${username}`, eventsData);
                }
            } catch (err) {
                eventsData = [];
                console.warn('Could not fetch contributor events:', err);
            }
        }
        eventsData = Array.isArray(eventsData) ? eventsData : [];
        reposData = Array.isArray(reposData) ? reposData : [];

        // Build and display results
        const data = buildRecommendations(userData, reposData, eventsData);
        displayResults(data);

    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'Failed to analyze GitHub profile. Please try again.');
    } finally {
        // Reset button state and hide loading indicator (on success or error)
        submitBtn.disabled = false;
        btnText.textContent = 'Find My Projects';
        loadingSpinner.classList.add('hidden');
        if (loadingEl) loadingEl.style.display = 'none';
    }
});

function buildRecommendations(userData, repos, eventsData = []) {
    // Contributor activity signals: compute score from GitHub events
    // PushEvent = commits (weight 2), PullRequestEvent = PRs (weight 3), IssuesEvent = issues (weight 1)
    const pushEvents = eventsData.filter(e => e.type === 'PushEvent').length;
    const pullRequestEvents = eventsData.filter(e => e.type === 'PullRequestEvent').length;
    const issuesEvents = eventsData.filter(e => e.type === 'IssuesEvent').length;
    const activityScore = (pushEvents * 2) + (pullRequestEvents * 3) + (issuesEvents * 1);

    // Contributor languages: detect from repository language frequency.
    // Repos with language metadata are counted; top 3 by frequency become topLanguages.
    const languageCounts = {};
    (repos || []).forEach(repo => {
        if (repo && repo.language) {
            languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
        }
    });
    const languages = Object.keys(languageCounts)
        .sort((a, b) => languageCounts[b] - languageCounts[a])
        .slice(0, 10);
    const topLanguages = languages.slice(0, 3);

    // Contributor interests: topics from their repos. Used to match recommended repos.
    const contributorTopics = new Set();
    (repos || []).forEach(repo => {
        if (repo && Array.isArray(repo.topics)) {
            repo.topics.forEach(t => contributorTopics.add(t));
        }
    });
    const relevantTopics = contributorTopics.size > 0
        ? Array.from(contributorTopics)
        : ['security', 'bug-bounty', 'opensource', 'javascript', 'python', 'web', 'ai', 'machine-learning'];

    const github_stats = {
        username: userData.login,
        name: userData.name || userData.login,
        avatar_url: userData.avatar_url,
        bio: userData.bio,
        public_repos: userData.public_repos,
        followers: userData.followers,
        following: userData.following,
        languages,
        top_languages: topLanguages,
        activity_score: activityScore,
        activity_breakdown: { pushEvents, pullRequestEvents, issuesEvents }
    };

    // topicScore: repos with topics matching contributor interests rank higher.
    // Handles missing/empty repo.topics safely. Improves relevance for OWASP/security contributors.
    function getTopicScore(repo) {
        if (!repo || !Array.isArray(repo.topics) || repo.topics.length === 0) return 0;
        let score = 0;
        repo.topics.forEach(topic => {
            if (relevantTopics.includes(topic)) score += 2;
        });
        return score;
    }

    // Ranking: (stars * 0.5) + (languageScore * 0.2) + (topicScore * 0.1)
    const getFinalScore = (repo) => {
        const stars = repo.stargazers_count || 0;
        const languageScore = (topLanguages.length && repo && repo.language && topLanguages.includes(repo.language)) ? 5 : 0;
        const topicScore = getTopicScore(repo);
        return (stars * 0.5) + (languageScore * 0.2) + (topicScore * 0.1);
    };
    const recommended_repos = repos
        .filter(r => !r.fork && r.description)
        .sort((a, b) => getFinalScore(b) - getFinalScore(a))
        .slice(0, 6)
        .map(r => ({
            name: r.full_name,
            description: r.description,
            stars: r.stargazers_count,
            url: r.html_url,
            topics: Array.isArray(r.topics) ? r.topics : []
        }));

    const recommended_communities = [
        {
            name: 'OWASP BLT',
            description: 'Bug Logging Tool — an open source security platform',
            members: '1,000+',
            url: 'https://github.com/OWASP-BLT/BLT'
        },
        {
            name: 'OWASP Foundation',
            description: 'The Open Web Application Security Project',
            members: '50,000+',
            url: 'https://owasp.org/'
        }
    ];

    const recommended_articles = [
        {
            title: 'How to Contribute to Open Source',
            category: 'Open Source',
            url: 'https://opensource.guide/how-to-contribute/'
        },
        {
            title: 'GitHub Skills',
            category: 'GitHub',
            url: 'https://skills.github.com/'
        }
    ];

    const recommended_discussion_channels = [
        {
            name: 'BLT Discussions',
            platform: 'GitHub',
            icon: 'fa-brands fa-github',
            url: 'https://github.com/OWASP-BLT/BLT/discussions'
        },
        {
            name: 'OWASP Slack',
            platform: 'Slack',
            icon: 'fa-brands fa-slack',
            url: 'https://owasp.org/slack/invite'
        },
        {
            name: 'Dev Community',
            platform: 'DEV.to',
            icon: 'fa-brands fa-dev',
            url: 'https://dev.to/'
        },
        {
            name: 'Stack Overflow',
            platform: 'Stack Overflow',
            icon: 'fa-brands fa-stack-overflow',
            url: 'https://stackoverflow.com/'
        }
    ];

    return {
        github_stats,
        recommended_repos,
        recommended_communities,
        recommended_articles,
        recommended_discussion_channels
    };
}

function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function displayResults(data) {
    const resultsSection = document.getElementById('results-section');
    const githubStats = data.github_stats;

    // Store data globally for profile creation
    window.currentUserData = data;

    // Populate GitHub Stats
    document.getElementById('user-avatar').src = githubStats.avatar_url || 'static/logo.png';
    document.getElementById('user-name').textContent = githubStats.name || githubStats.username;
    document.getElementById('user-bio').textContent = githubStats.bio || 'No bio available';
    document.getElementById('user-repos').textContent = githubStats.public_repos || 0;
    document.getElementById('user-followers').textContent = githubStats.followers || 0;
    document.getElementById('user-following').textContent = githubStats.following || 0;

    // Display Contributor Activity Score (from PushEvent, PullRequestEvent, IssuesEvent)
    const activityScoreEl = document.getElementById('contributor-activity-score');
    if (activityScoreEl) {
        activityScoreEl.textContent = githubStats.activity_score ?? 0;
    }

    // Display Top Languages (contributor's main languages used for language match scoring)
    const topLanguagesEl = document.getElementById('top-languages-list');
    if (topLanguagesEl) {
        const topLangs = githubStats.top_languages || [];
        topLanguagesEl.textContent = topLangs.length ? topLangs.join(', ') : 'No language data';
    }

    // Display languages
    const languagesContainer = document.getElementById('user-languages');
    languagesContainer.innerHTML = '';
    (githubStats.languages || []).forEach(lang => {
        const badge = document.createElement('span');
        badge.className = 'px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs font-semibold';
        badge.textContent = lang;
        languagesContainer.appendChild(badge);
    });

    // Display recommended repositories
    const reposContainer = document.getElementById('recommended-repos');
    reposContainer.innerHTML = '';
    (data.recommended_repos || []).forEach(repo => {
        const topics = repo.topics && repo.topics.length > 0 ? repo.topics.join(', ') : 'None';
        const repoCard = document.createElement('div');
        repoCard.className = 'surface-card rounded-xl p-5 hover:shadow-lg transition';
        repoCard.innerHTML = `
    <div class="flex items-start justify-between mb-3">
        <h4 class="font-bold text-gray-900 dark:text-white text-lg">${escapeHtml(repo.name)}</h4>
        <span class="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-1 rounded-full">
            <i class="fas fa-star"></i> ${repo.stars}
        </span>
    </div>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">${escapeHtml(repo.description)}</p>
    <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
        <span class="font-semibold">Topics:</span> ${escapeHtml(topics)}
    </p>
    <a href="${escapeHtml(repo.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold text-sm hover:underline">
        <i class="fab fa-github"></i> View Repository
    </a>
    `;
        reposContainer.appendChild(repoCard);
    });

    // Display recommended communities
    const communitiesContainer = document.getElementById('recommended-communities');
    communitiesContainer.innerHTML = '';
    (data.recommended_communities || []).forEach(community => {
        const communityCard = document.createElement('div');
        communityCard.className = 'surface-card rounded-xl p-5 hover:shadow-lg transition';
        communityCard.innerHTML = `
    <h4 class="font-bold text-gray-900 dark:text-white mb-2">${escapeHtml(community.name)}</h4>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">${escapeHtml(community.description)}</p>
    <div class="flex justify-between items-center">
        <span class="text-xs text-gray-500 dark:text-gray-400">
            <i class="fas fa-users"></i> ${escapeHtml(community.members)}
        </span>
        <a href="${escapeHtml(community.url)}" target="_blank" rel="noopener noreferrer" class="text-red-600 dark:text-red-400 font-semibold text-sm hover:underline">
            Visit <i class="fas fa-external-link-alt ml-1"></i>
        </a>
    </div>
    `;
        communitiesContainer.appendChild(communityCard);
    });

    // Display recommended articles
    const articlesContainer = document.getElementById('recommended-articles');
    articlesContainer.innerHTML = '';
    (data.recommended_articles || []).forEach(article => {
        const articleCard = document.createElement('div');
        articleCard.className = 'surface-card rounded-xl p-5 hover:shadow-lg transition';
        articleCard.innerHTML = `
    <div class="flex items-start gap-3">
        <div class="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
            <i class="fas fa-file-alt text-red-600 dark:text-red-400"></i>
        </div>
        <div class="flex-1">
            <h4 class="font-semibold text-gray-900 dark:text-white mb-1">${escapeHtml(article.title)}</h4>
            <span class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">
                ${escapeHtml(article.category)}
            </span>
            <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" class="block mt-2 text-red-600 dark:text-red-400 font-semibold text-sm hover:underline">
                Read More <i class="fas fa-arrow-right ml-1"></i>
            </a>
        </div>
    </div>
    `;
        articlesContainer.appendChild(articleCard);
    });

    // Display discussion channels
    const channelsContainer = document.getElementById('discussion-channels');
    channelsContainer.innerHTML = '';
    (data.recommended_discussion_channels || []).forEach(channel => {
        const channelCard = document.createElement('div');
        channelCard.className = 'surface-card rounded-xl p-5 text-center hover:shadow-lg transition';
        channelCard.innerHTML = `
    <div class="text-3xl mb-3">
        <i class="${escapeHtml(channel.icon)} text-red-600 dark:text-red-400"></i>
    </div>
    <h4 class="font-semibold text-gray-900 dark:text-white text-sm mb-1">${escapeHtml(channel.name)}</h4>
    <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">${escapeHtml(channel.platform)}</p>
    <a href="${escapeHtml(channel.url)}" target="_blank" rel="noopener noreferrer" class="text-red-600 dark:text-red-400 font-semibold text-xs hover:underline">
        Join <i class="fas fa-arrow-right ml-1"></i>
    </a>
    `;
        channelsContainer.appendChild(channelCard);
    });

    // Update GitHub profile link (in stats area)
    const profileLink = document.getElementById('github-profile-link');
    if (profileLink) {
        profileLink.href = `https://github.com/${encodeURIComponent(githubStats.username)}`;
        const span = profileLink.querySelector('span');
        if (span) span.textContent = `View ${githubStats.username}'s GitHub profile`;
    }

    // Update GitHub profile link (in button row)
    const viewProfileBtn = document.getElementById('view-github-profile');
    if (viewProfileBtn) {
        viewProfileBtn.href = `https://github.com/${encodeURIComponent(githubStats.username)}`;
    }

    // Show results section and scroll to it
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Hide features section
    document.querySelector('.grid.gap-6.md\\:grid-cols-3.mb-12').classList.add('hidden');
    document.querySelector('.surface-card.rounded-2xl.p-8.sm\\:p-10').classList.add('hidden');
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Analyze another profile button handler
document.addEventListener('DOMContentLoaded', () => {
    const analyzeAnotherBtn = document.getElementById('analyze-another');
    if (analyzeAnotherBtn) {
        analyzeAnotherBtn.addEventListener('click', () => {
            // Hide results
            document.getElementById('results-section').classList.add('hidden');

            // Show form and features
            document.querySelector('.grid.gap-6.md\\:grid-cols-3.mb-12').classList.remove('hidden');
            document.querySelector('.surface-card.rounded-2xl.p-8.sm\\:p-10').classList.remove('hidden');

            // Clear form
            usernameInput.value = '';

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Create profile button handler
    const createProfileBtn = document.getElementById('create-profile-btn');
    if (createProfileBtn) {
        createProfileBtn.addEventListener('click', () => {
            if (window.currentUserData) {
                const profileUrl = buildProfileIssueUrl(window.currentUserData);
                window.open(profileUrl, '_blank');
            }
        });
    }
});

function buildProfileIssueUrl(data) {
    const githubStats = data.github_stats;

    // Build the issue URL with pre-filled data
    const baseUrl = 'https://github.com/OWASP-BLT/BLT-OSSH/issues/new';
    const template = 'user_profile.yml';

    // Create URL parameters
    const params = new URLSearchParams({
        template: template,
        title: `[PROFILE] ${githubStats.name || githubStats.username}`,
        'github_username': githubStats.username,
        'display_name': githubStats.name || githubStats.username,
        'bio': githubStats.bio || `Open source developer passionate about ${githubStats.languages.slice(0, 3).join(', ')}`,
        'skills': githubStats.languages.join(', '),
        'looking_for': 'Looking to contribute to open source projects and connect with other developers'
    });

    return `${baseUrl}?${params.toString()}`;
}

// Set footer year
document.getElementById('footer-year').textContent = new Date().getFullYear();