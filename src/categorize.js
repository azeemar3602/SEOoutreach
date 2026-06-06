const GUEST_POST_PATTERNS = [
  /guest[\s-]?post/i,
  /write[\s-]?for[\s-]?us/i,
  /contribute/i,
  /submit[\s-]?a[\s-]?guest/i,
  /become[\s-]?a[\s-]?contributor/i,
  /author[\s-]?guidelines/i,
  /submission[\s-]?guidelines/i,
  /pitch[\s-]?us/i,
];

const RESOURCE_PATTERNS = [
  /resources?/i,
  /useful[\s-]?links/i,
  /link[\s-]?directory/i,
  /recommended/i,
  /tools?[\s-]?list/i,
];

const DIRECTORY_PATTERNS = [
  /directory/i,
  /listing/i,
  /add[\s-]?your[\s-]?site/i,
  /submit[\s-]?site/i,
];

const FORUM_PATTERNS = [
  /forum/i,
  /community/i,
  /discuss/i,
  /thread/i,
];

const NEWS_PATTERNS = [
  /news/i,
  /press[\s-]?release/i,
  /article/i,
  /blog/i,
  /magazine/i,
];

export function extractDomain(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return url;
  }
}

export function categorizeUrl(sourceUrl, anchorText = '', pageContent = '') {
  const combined = `${sourceUrl} ${anchorText} ${pageContent}`.toLowerCase();

  if (GUEST_POST_PATTERNS.some((p) => p.test(combined))) return 'guest_post';
  if (/forbes\.com\/advisor|wpbeginner\.com\/showcase|best-.*-software|best-.*-service|roundup|vs-|comparison/i.test(combined)) {
    return 'editorial';
  }
  if (/apps\.apple\.com|play\.google\.com/i.test(combined)) return 'directory';
  if (RESOURCE_PATTERNS.some((p) => p.test(combined))) return 'resource_page';
  if (DIRECTORY_PATTERNS.some((p) => p.test(combined))) return 'directory';
  if (FORUM_PATTERNS.some((p) => p.test(combined))) return 'forum';
  if (NEWS_PATTERNS.some((p) => p.test(combined))) return 'editorial';

  return 'unknown';
}

export function scoreOpportunity({ link_type, dr, is_dofollow, contact_email }) {
  let score = 0;

  const typeScores = {
    guest_post: 40,
    editorial: 35,
    resource_page: 30,
    directory: 20,
    forum: 5,
    unknown: 10,
  };
  score += typeScores[link_type] ?? 10;

  if (dr) score += Math.min(dr, 50);
  if (is_dofollow) score += 15;
  if (contact_email) score += 20;

  return score;
}

export function detectGuestPostPage(html, pageUrl) {
  const lower = html.toLowerCase();
  const urlLower = pageUrl.toLowerCase();

  const urlHints = ['guest-post', 'write-for-us', 'contribute', 'submit', 'author'];
  const urlMatch = urlHints.some((h) => urlLower.includes(h));

  const contentMatch = GUEST_POST_PATTERNS.some((p) => p.test(html));
  const hasGuidelines = /guidelines|requirements|word count|submission/i.test(html);

  if (urlMatch || (contentMatch && hasGuidelines)) {
    return pageUrl;
  }
  return null;
}
