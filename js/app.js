
// Dark mode toggle
const darkToggle = document.getElementById('dark-toggle');
const html = document.documentElement;

// Check for saved theme preference or default to light mode
const currentTheme = localStorage.getItem('theme') || 'light';
if (currentTheme === 'dark') {
    html.classList.add('dark');
}

if (darkToggle) {
darkToggle.addEventListener('click', () => {
    html.classList.toggle('dark');
    const theme = html.classList.contains('dark') ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
});
}

// Form submission
const form = document.getElementById('ossh-form');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');
const loadingSpinner = document.getElementById('loading-spinner');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const usernameInput = document.getElementById('github-username');

if (!window.OSSH_SKIP_APP_FORM && form) {
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

        // Fetch user repositories
        const reposResponse = await fetch(
            `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100`,
            { headers: { Accept: 'application/vnd.github+json' } }
        );
        const reposData = reposResponse.ok ? await reposResponse.json() : [];

        // Build and display results (async: loads catalog)
        const data = await buildRecommendations(userData, reposData);
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
}

// --- Catalog-based recommendation engine (from main) ---
const CATALOG_URL = 'data/ossh_catalog.json';
let _catalogCache = null;

const TAG_NORMALIZATION = {
    js: 'javascript',
    node: 'nodejs',
    'c++': 'cpp',
    csharp: 'c#',
    golang: 'go',
    py: 'python',
};

/** Normalizes a tag for matching. */
function normalizeTag(tag) {
    if (!tag) return '';
    const t = String(tag).trim().toLowerCase();
    return TAG_NORMALIZATION[t] || t;
}

/** Tokenizes text into normalized words. */
function tokenize(text) {
    if (!text) return [];
    let s = String(text).replace(/([a-z])([A-Z])/g, '$1 $2');
    s = s.replace(/[^a-zA-Z0-9\s]/g, ' ');
    return s.split(/\s+/).map((w) => normalizeTag(w)).filter(Boolean);
}

/** Loads and caches the OSSH catalog. */
async function loadCatalog() {
    if (_catalogCache) return _catalogCache;
    const resp = await fetch(CATALOG_URL);
    if (!resp.ok) throw new Error(`Failed to load catalog (${resp.status})`);
    _catalogCache = await resp.json();
    return _catalogCache;
}

/** Builds the set of allowed tags from catalog entries. */
function buildAllowedTagSet(catalog) {
    const s = new Set();
    const addTags = (arr) => {
        (arr || []).forEach((t) => s.add(normalizeTag(t)));
    };
    (catalog.repos || []).forEach((r) => addTags(r.tags));
    (catalog.communities || []).forEach((c) => addTags(c.tags));
    (catalog.discussion_channels || []).forEach((c) => addTags(c.tags));
    (catalog.articles || []).forEach((a) => addTags(a.tags));
    (catalog.repos || []).forEach((r) => r.primary_language && s.add(normalizeTag(r.primary_language)));
    (catalog.communities || []).forEach((c) => c.primary_language && s.add(normalizeTag(c.primary_language)));
    return s;
}

/** Preprocesses user repos into tag counts and language weights. */
function preprocessUser(repos, allowedTags) {
    const tagCounts = new Map();
    const langCounts = new Map();
    const bump = (k, n = 1) => tagCounts.set(k, (tagCounts.get(k) || 0) + n);

    for (const repo of repos || []) {
        if (repo.language) {
            const lang = normalizeTag(repo.language);
            langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
            if (allowedTags.has(lang)) bump(lang, 2);
        }
        for (const w of tokenize(repo.description || '')) {
            if (allowedTags.has(w)) bump(w, 1);
        }
        for (const topic of (repo.topics || [])) {
            const t = normalizeTag(topic);
            if (allowedTags.has(t)) bump(t, 3);
        }
    }

    const userTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
    const total = [...langCounts.values()].reduce((a, b) => a + b, 0) || 1;
    const languageWeights = {};
    for (const [lang, count] of langCounts.entries()) {
        const pct = (count / total) * 100;
        if (pct >= 5) languageWeights[lang] = pct;
    }
    return { userTags, languageWeights };
}

/** Scores catalog items against user profile and returns top N. */
function recommendGeneric(items, userTags, languageWeights, opts) {
    const tagWeight = Object.fromEntries(userTags);
    const topN = opts?.topN ?? 12;
    const usesLanguage = !!opts?.usesLanguage;
    const out = new Map();

    for (const item of items || []) {
        const itemTags = (item.tags || []).map(normalizeTag);
        const tagScore = itemTags.reduce((sum, t) => sum + (tagWeight[t] || 0), 0);
        let langScore = 0;
        let matchingLanguages = [];
        if (usesLanguage && item.primary_language) {
            const l = normalizeTag(item.primary_language);
            if (languageWeights[l]) {
                langScore = languageWeights[l];
                matchingLanguages = [item.primary_language];
            }
        }
        const relevance = tagScore + langScore;
        if (relevance <= 0) continue;

        const matchingTags = itemTags.filter((t) => tagWeight[t]).slice(0, 12);
        const reasons = [];
        if (matchingTags.length) reasons.push(`Matching tags: ${matchingTags.join(', ')}`);
        if (matchingLanguages.length) reasons.push(`Matching language: ${matchingLanguages.join(', ')}`);

        const scored = {
            item,
            relevance_score: relevance,
            reasoning: reasons.join(' | ') || 'No specific reason',
            matching_tags: matchingTags,
        };
        const key = item.html_url || item.url || item.invite_url || item.full_name || item.name;
        const existing = out.get(key);
        if (!existing || existing.relevance_score < scored.relevance_score) {
            out.set(key, scored);
        }
    }

    return [...out.values()]
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, topN);
}

/**
 * Assigns a user to one of four houses based on repo languages and keywords.
 * @param {Object} userData - GitHub user profile data
 * @param {Array} repos - User's repositories
 * @param {string[]} languages - Top languages from repos
 * @returns {Object} House object with id, name, icon, desc, color, score
 */
function assignHouse(userData, repos, languages) {
    const HOUSES = {
        buggleton: {
            name: 'Buggleton',
            icon: '🐛',
            desc: 'Bug hunters & QA champions',
            color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
            languages: ['Python', 'JavaScript', 'TypeScript', 'Java'],
            keywords: ['bug', 'test', 'qa', 'selenium', 'cypress', 'jest', 'pytest', 'mocha', 'testing', 'quality']
        },
        cybermoose: {
            name: 'Cybermoose',
            icon: '🛡️',
            desc: 'Security & cybersecurity experts',
            color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
            languages: ['Python', 'C', 'Go', 'Rust', 'JavaScript'],
            keywords: ['security', 'pentest', 'exploit', 'vuln', 'owasp', 'hack', 'crypto', 'encrypt', 'auth', 'xss', 'sqli']
        },
        bufferbit: {
            name: 'Bufferbit',
            icon: '⚙️',
            desc: 'Infrastructure & DevOps builders',
            color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700',
            languages: ['Shell', 'Python', 'Go', 'HCL', 'YAML', 'Dockerfile'],
            keywords: ['docker', 'kubernetes', 'terraform', 'ansible', 'ci', 'devops', 'infra', 'deploy', 'pipeline', 'cloud']
        },
        darkram: {
            name: 'Darkram',
            icon: '⚡',
            desc: 'Backend & systems engineers',
            color: 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300 border-violet-300 dark:border-violet-700',
            languages: ['C', 'C++', 'Rust', 'Go', 'Python', 'Java'],
            keywords: ['backend', 'system', 'kernel', 'embedded', 'compiler', 'database', 'api', 'server', 'performance']
        }
    };

    const scores = { buggleton: 0, cybermoose: 0, bufferbit: 0, darkram: 0 };
    const text = [
        (userData.bio || '').toLowerCase(),
        ...repos.map(r => [r.name, r.description, r.full_name].filter(Boolean).join(' ').toLowerCase())
    ].join(' ');

    Object.keys(HOUSES).forEach(houseId => {
        const house = HOUSES[houseId];
        house.languages.forEach(lang => {
            if (languages.includes(lang)) scores[houseId] += 3;
        });
        house.keywords.forEach(kw => {
            const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(text)) scores[houseId] += 2;
        });
    });

    // Sort by score desc, then by house id alphabetically for deterministic tie-breaking
    const sorted = Object.entries(scores).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
    });
    const winner = sorted[0];
    const house = HOUSES[winner[0]];
    return { id: winner[0], ...house, score: winner[1] };
}

/**
 * Builds recommendation data from GitHub profile and repos using catalog.
 * @param {Object} userData - GitHub user profile
 * @param {Array} repos - User's repositories
 * @returns {Promise<Object>} Recommendations with github_stats, house, repos, communities, articles, channels
 */
async function buildRecommendations(userData, repos) {
    const languageCounts = {};
    repos.forEach(repo => {
        if (repo.language) {
            languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
        }
    });
    const languages = Object.keys(languageCounts)
        .sort((a, b) => languageCounts[b] - languageCounts[a])
        .slice(0, 10);

    const house = assignHouse(userData, repos, languages);

    let catalog;
    try {
        catalog = await loadCatalog();
    } catch (e) {
        console.warn('Catalog load failed, using fallback:', e);
        const github_stats = {
            username: userData.login,
            name: userData.name || userData.login,
            avatar_url: userData.avatar_url,
            bio: userData.bio,
            public_repos: userData.public_repos,
            followers: userData.followers,
            following: userData.following,
            languages,
        };
        return {
            github_stats,
            house,
            recommended_repos: [],
            recommended_communities: [],
            recommended_articles: [],
            recommended_discussion_channels: [],
        };
    }

    const allowedTags = buildAllowedTagSet(catalog);
    const { userTags, languageWeights } = preprocessUser(repos, allowedTags);

    const github_stats = {
        username: userData.login,
        name: userData.name || userData.login,
        avatar_url: userData.avatar_url,
        bio: userData.bio,
        public_repos: userData.public_repos,
        followers: userData.followers,
        following: userData.following,
        languages: Object.entries(languageWeights)
            .sort(([, a], [, b]) => b - a)
            .map(([lang]) => lang)
            .slice(0, 10),
    };

    const recommended_repos = recommendGeneric(catalog.repos, userTags, languageWeights, { topN: 6, usesLanguage: true });
    const recommended_communities = recommendGeneric(catalog.communities, userTags, languageWeights, { topN: 6, usesLanguage: true });
    const recommended_discussion_channels = recommendGeneric(catalog.discussion_channels, userTags, languageWeights, { topN: 6, usesLanguage: false });
    const recommended_articles = recommendGeneric(catalog.articles, userTags, languageWeights, { topN: 8, usesLanguage: false });

    return {
        github_stats,
        house,
        recommended_repos,
        recommended_communities,
        recommended_articles,
        recommended_discussion_channels,
    };
}

/** Shows an error message in the UI. */
function showError(message) {
    if (errorText) errorText.textContent = message;
    if (errorMessage) {
        errorMessage.classList.remove('hidden');
        errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/** Hides the error message. */
function hideError() {
    if (errorMessage) errorMessage.classList.add('hidden');
}

/**
 * Renders recommendation results to the DOM.
 * @param {Object} data - Recommendation data from buildRecommendations
 */
function displayResults(data) {
    const resultsSection = document.getElementById('results-section');
    const githubStats = data.github_stats;

    // Store data globally for profile creation
    window.currentUserData = data;

    // Populate GitHub Stats
    document.getElementById('user-avatar').src = githubStats.avatar_url || 'static/logo.png';
    document.getElementById('user-name').textContent = githubStats.name || githubStats.username;
    document.getElementById('user-bio').textContent = githubStats.bio || 'No bio available';

    // Display House Badge
    const houseBadge = document.getElementById('house-badge');
    if (houseBadge && data.house) {
        houseBadge.className = `inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold border ${data.house.color}`;
        houseBadge.title = data.house.desc;
        const houseIcon = document.getElementById('house-icon');
        const houseName = document.getElementById('house-name');
        if (houseIcon) houseIcon.textContent = data.house.icon;
        if (houseName) houseName.textContent = data.house.name;
        houseBadge.classList.remove('hidden');
    } else if (houseBadge) {
        houseBadge.classList.add('hidden');
    }
    document.getElementById('user-repos').textContent = githubStats.public_repos || 0;
    document.getElementById('user-followers').textContent = githubStats.followers || 0;
    document.getElementById('user-following').textContent = githubStats.following || 0;

    // Display languages
    const languagesContainer = document.getElementById('user-languages');
    languagesContainer.innerHTML = '';
    (githubStats.languages || []).forEach(lang => {
        const badge = document.createElement('span');
        badge.className = 'px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs font-semibold';
        badge.textContent = lang;
        languagesContainer.appendChild(badge);
    });

    function sanitizeExternalUrl(rawUrl) {
        try {
            const url = new URL(rawUrl, window.location.origin);
            return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '#';
        } catch {
            return '#';
        }
    }

    function renderTagChips(tags, limit = 12) {
        const safe = (tags || []).slice(0, limit);
        if (!safe.length) return '';
        return `<div class="flex flex-wrap gap-1 mb-2">${safe.map((t) => `<span class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">${escapeHtml(t)}</span>`).join('')}</div>`;
    }

    function renderScoreReason(row) {
        if (!row || typeof row !== 'object') return '';
        const score = row.relevance_score;
        const reason = row.reasoning;
        const hasScore = typeof score === 'number' && isFinite(score);
        const hasReason = typeof reason === 'string' && reason.trim().length > 0;
        if (!hasScore && !hasReason) return '';
        return `<div class="text-xs text-gray-500 dark:text-gray-400 mb-2">${hasScore ? `Relevance: ${escapeHtml(String(Math.round(score * 100) / 100))}` : ''} ${hasReason ? ` | ${escapeHtml(reason)}` : ''}</div>`;
    }

    // Display recommended repositories (supports catalog format: {item, relevance_score} or simple format)
    const reposContainer = document.getElementById('recommended-repos');
    reposContainer.innerHTML = '';
    (data.recommended_repos || []).forEach((row) => {
        const repo = row?.item ? row.item : row;
        const repoName = repo.full_name || repo.name || '';
        const repoDesc = repo.description || '';
        const repoStars = repo.stars != null ? repo.stars : (repo.stargazers_count != null ? repo.stargazers_count : 0);
        const repoUrl = sanitizeExternalUrl(repo.url || repo.html_url || '#');
        const tags = repo.tags || row?.matching_tags || [];
        const scoreReason = renderScoreReason(row?.item ? row : null);

        const repoCard = document.createElement('div');
        repoCard.className = 'surface-card rounded-xl p-5 hover:shadow-lg transition';
        repoCard.innerHTML = `
    <div class="flex items-start justify-between mb-3">
        <h4 class="font-bold text-gray-900 dark:text-white text-lg">${escapeHtml(repoName)}</h4>
        <span class="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-1 rounded-full">
            <i class="fas fa-star"></i> ${escapeHtml(String(repoStars))}
        </span>
    </div>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${escapeHtml(repoDesc)}</p>
    ${renderTagChips(tags)}
    ${scoreReason}
    <a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold text-sm hover:underline">
        <i class="fab fa-github"></i> View Repository
    </a>
    `;
        reposContainer.appendChild(repoCard);
    });

    // Display recommended communities (supports catalog format)
    const communitiesContainer = document.getElementById('recommended-communities');
    communitiesContainer.innerHTML = '';
    (data.recommended_communities || []).forEach((row) => {
        const community = row?.item ? row.item : row;
        const cName = community.name || '';
        const cDesc = community.description || '';
        const cMembers = community.members || (community.member_count != null ? String(community.member_count) : '');
        const cUrl = sanitizeExternalUrl(community.url || community.invite_url || '#');
        const communityCard = document.createElement('div');
        communityCard.className = 'surface-card rounded-xl p-5 hover:shadow-lg transition';
        communityCard.innerHTML = `
    <h4 class="font-bold text-gray-900 dark:text-white mb-2">${escapeHtml(cName)}</h4>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">${escapeHtml(cDesc)}</p>
    <div class="flex justify-between items-center">
        <span class="text-xs text-gray-500 dark:text-gray-400">
            <i class="fas fa-users"></i> ${escapeHtml(String(cMembers || '—'))}
        </span>
        <a href="${escapeHtml(cUrl)}" target="_blank" rel="noopener noreferrer" class="text-red-600 dark:text-red-400 font-semibold text-sm hover:underline">
            Visit <i class="fas fa-external-link-alt ml-1"></i>
        </a>
    </div>
    ${renderTagChips(community.tags || row?.matching_tags)}
    ${renderScoreReason(row?.item ? row : null)}
    `;
        communitiesContainer.appendChild(communityCard);
    });

    // Display recommended articles (supports catalog format)
    const articlesContainer = document.getElementById('recommended-articles');
    articlesContainer.innerHTML = '';
    (data.recommended_articles || []).forEach((row) => {
        const article = row?.item ? row.item : row;
        const aTitle = article.title || '';
        const aCategory = article.category || '';
        const aUrl = sanitizeExternalUrl(article.url || '#');
        const articleCard = document.createElement('div');
        articleCard.className = 'surface-card rounded-xl p-5 hover:shadow-lg transition';
        articleCard.innerHTML = `
    <div class="flex items-start gap-3">
        <div class="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
            <i class="fas fa-file-alt text-red-600 dark:text-red-400"></i>
        </div>
        <div class="flex-1">
            <h4 class="font-semibold text-gray-900 dark:text-white mb-1">${escapeHtml(aTitle)}</h4>
            <span class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">
                ${escapeHtml(aCategory)}
            </span>
            ${renderTagChips(article.tags || row?.matching_tags)}
            ${renderScoreReason(row?.item ? row : null)}
            <a href="${escapeHtml(aUrl)}" target="_blank" rel="noopener noreferrer" class="block mt-2 text-red-600 dark:text-red-400 font-semibold text-sm hover:underline">
                Read More <i class="fas fa-arrow-right ml-1"></i>
            </a>
        </div>
    </div>
    `;
        articlesContainer.appendChild(articleCard);
    });

    // Display discussion channels (supports catalog format)
    const channelsContainer = document.getElementById('discussion-channels');
    channelsContainer.innerHTML = '';
    (data.recommended_discussion_channels || []).forEach((row) => {
        const channel = row?.item ? row.item : row;
        const chName = channel.name || '';
        const chDesc = channel.description || '';
        const chSource = channel.source || channel.platform || '—';
        const chMembers = channel.member_count != null ? channel.member_count : (channel.members != null ? channel.members : '—');
        const chUrl = sanitizeExternalUrl(channel.invite_url || channel.url || '#');
        const chTags = channel.tags || row?.matching_tags || [];
        const chIcon = channel.icon || 'fa-brands fa-comments';
        const channelCard = document.createElement('div');
        channelCard.className = 'surface-card rounded-xl p-5 hover:shadow-lg transition';
        channelCard.innerHTML = `
    <div class="text-3xl mb-3">
        <i class="${escapeHtml(chIcon)} text-red-600 dark:text-red-400"></i>
    </div>
    <h4 class="font-semibold text-gray-900 dark:text-white text-sm mb-1">${escapeHtml(chName)}</h4>
    <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">${escapeHtml(chDesc)}</p>
    <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Source: ${escapeHtml(String(chSource))} &nbsp; • &nbsp; Members: ${escapeHtml(String(chMembers))}</p>
    ${renderTagChips(chTags)}
    ${renderScoreReason(row?.item ? row : null)}
    <a href="${escapeHtml(chUrl)}" target="_blank" rel="noopener noreferrer" class="text-red-600 dark:text-red-400 font-semibold text-xs hover:underline">
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

    // Setup create profile button
    setupCreateProfileButton(data);

    // Show results section and scroll to it
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Hide features section
    const featuresGrid = document.querySelector('.grid.gap-6.md\\:grid-cols-3.mb-12');
    const formCard = document.querySelector('.surface-card.rounded-2xl.p-8.sm\\:p-10');
    if (featuresGrid) featuresGrid.classList.add('hidden');
    if (formCard) formCard.classList.add('hidden');
}

/** Escapes HTML special characters to prevent XSS. */
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
            const resultsSection = document.getElementById('results-section');
            const featuresGrid = document.querySelector('.grid.gap-6.md\\:grid-cols-3.mb-12');
            const formCard = document.querySelector('.surface-card.rounded-2xl.p-8.sm\\:p-10');

            if (resultsSection) resultsSection.classList.add('hidden');
            if (featuresGrid) featuresGrid.classList.remove('hidden');
            if (formCard) formCard.classList.remove('hidden');

            if (usernameInput) usernameInput.value = '';

            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Create profile button handler
});

/** Attaches click handler to create-profile button. */
function setupCreateProfileButton(data) {
    const createProfileBtn = document.getElementById('create-profile-btn');
    if (!createProfileBtn) return;

    const newBtn = createProfileBtn.cloneNode(true);
    createProfileBtn.parentNode.replaceChild(newBtn, createProfileBtn);

    newBtn.addEventListener('click', () => {
        const profileUrl = buildProfileIssueUrl(data);
        window.open(profileUrl, '_blank');
    });
}

/** Builds GitHub issue URL with pre-filled profile data. */
function buildProfileIssueUrl(data) {
    const githubStats = data.github_stats;
    const baseUrl = 'https://github.com/OWASP-BLT/BLT-OSSH/issues/new';

    const skills = (githubStats.languages || []).slice(0, 10).join(', ');
    const topLanguages = (githubStats.languages || []).slice(0, 3).join(', ');
    const commNames = (data.recommended_communities || []).map((c) => (c.item || c).name).join(', ');
    const lookingFor = `Looking to contribute to open source projects in ${topLanguages}. Interested in ${commNames || 'open source'}.`;

    const recommendedProjects = (data.recommended_repos || [])
        .slice(0, 5)
        .map((r) => {
            const repo = r.item || r;
            const name = repo.full_name || repo.name;
            const url = repo.url || repo.html_url || '#';
            const stars = repo.stars != null ? repo.stars : repo.stargazers_count || 0;
            const desc = repo.description || '';
            return `- [${name}](${url}) ⭐ ${stars} - ${desc}`;
        })
        .join('\n');

    const recommendedCommunities = (data.recommended_communities || [])
        .map((c) => {
            const comm = c.item || c;
            return `- [${comm.name}](${comm.url || comm.invite_url || '#'}) - ${comm.description || ''} (${comm.members || comm.member_count || '—'} members)`;
        })
        .join('\n');

    const recommendedArticles = (data.recommended_articles || [])
        .map((a) => {
            const art = a.item || a;
            return `- [${art.title}](${art.url || '#'}) - ${art.category || ''}`;
        })
        .join('\n');

    const bodyContent = `# 🎯 OSSH Analysis Summary

> **Profile analyzed on:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

## 📊 GitHub Stats
- **Your House:** ${data.house ? `${data.house.icon} ${data.house.name} — ${data.house.desc}` : '—'}
- **Username:** [@${githubStats.username}](https://github.com/${githubStats.username})
- **Name:** ${githubStats.name || githubStats.username}
- **Bio:** ${githubStats.bio || 'No bio provided'}
- **Repositories:** ${githubStats.public_repos}
- **Followers:** ${githubStats.followers}
- **Following:** ${githubStats.following}
- **Top Languages:** ${(githubStats.languages || []).slice(0, 5).join(', ')}

## 🌟 Your Top Recommended Projects
${recommendedProjects}

## 👥 Recommended Communities to Join
${recommendedCommunities}

## 📚 Recommended Articles for You
${recommendedArticles}

## 💬 Discussion Channels
${(data.recommended_discussion_channels || []).map((ch) => {
    const c = ch.item || ch;
    return `- [${c.name}](${c.invite_url || c.url || '#'}) - ${c.platform || c.source || '—'}`;
}).join('\n')}

---

**🤖 Generated by:** [OSSH - Open Source Sorting Hat](https://github.com/OWASP-BLT/BLT-OSSH)

**✏️ Note:** The information above has been automatically populated based on your GitHub profile analysis. Please review and edit the profile fields below before submitting.`;

    const recommendedProjectsDisplay = (data.recommended_repos || [])
        .slice(0, 6)
        .map((r) => {
            const repo = r.item || r;
            const name = repo.full_name || repo.name;
            const stars = repo.stars != null ? repo.stars : repo.stargazers_count || 0;
            const url = repo.url || repo.html_url || '#';
            return `**${name}** ⭐ ${stars}\n${repo.description || ''}\n🔗 [View](${url})`;
        })
        .join('\n\n');

    const recommendedCommunitiesDisplay = (data.recommended_communities || [])
        .map((c) => {
            const comm = c.item || c;
            return `**${comm.name}** (${comm.members || comm.member_count || '—'} members)\n${comm.description || ''}\n🔗 [Visit](${comm.url || comm.invite_url || '#'})`;
        })
        .join('\n\n');

    const recommendedArticlesDisplay = (data.recommended_articles || [])
        .map((a) => {
            const art = a.item || a;
            return `**${art.title}** - ${art.category || ''}\n🔗 [Read](${art.url || '#'})`;
        })
        .join('\n\n');

    const params = new URLSearchParams({
        template: 'user_profile.yml',
        title: `[PROFILE] ${githubStats.name || githubStats.username}`,
        labels: 'profile',
        'github_username': githubStats.username,
        'display_name': githubStats.name || githubStats.username,
        'bio': githubStats.bio || `Open source developer passionate about ${topLanguages}`,
        'skills': skills,
        'looking_for': lookingFor,
        'recommended_projects': recommendedProjectsDisplay,
        'recommended_communities': recommendedCommunitiesDisplay,
        'recommended_reading': recommendedArticlesDisplay,
    });

    params.append('body', bodyContent);
    return `${baseUrl}?${params.toString()}`;
}

// Expose for index.html inline script
window.buildRecommendations = buildRecommendations;
window.displayResults = displayResults;
window.showError = showError;
window.hideError = hideError;
window.escapeHtml = escapeHtml;

// Set footer year
const footerYear = document.getElementById('footer-year');
if (footerYear) footerYear.textContent = new Date().getFullYear();