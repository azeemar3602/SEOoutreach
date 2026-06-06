import { detectGuestPostPage } from './categorize.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const BLOCKED_EMAILS = new Set([
  'example.com', 'domain.com', 'email.com', 'yoursite.com',
  'sentry.io', 'wixpress.com', 'cloudflare.com', 'wordpress.com',
  'gravatar.com', 'w3.org', 'schema.org', 'google.com', 'facebook.com',
]);

const CONTACT_PATHS = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/write-for-us',
  '/guest-post',
  '/guest-posts',
  '/contribute',
  '/submit-guest-post',
  '/become-a-contributor',
  '/author-guidelines',
  '/pitch-us',
  '/advertise',
  '/media',
  '/press',
];

const FETCH_TIMEOUT = 10000;
const DELAY_MS = 1200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isValidEmail(email) {
  const lower = email.toLowerCase();
  if (lower.includes('noreply') || lower.includes('no-reply')) return false;
  if (lower.includes('.png') || lower.includes('.jpg') || lower.includes('.webp')) return false;

  const domain = lower.split('@')[1];
  if (!domain || BLOCKED_EMAILS.has(domain)) return false;
  if (domain.endsWith('.png') || domain.endsWith('.jpg')) return false;
  return true;
}

function extractEmails(html) {
  const found = new Set();
  const matches = html.match(EMAIL_REGEX) ?? [];
  for (const email of matches) {
    if (isValidEmail(email)) found.add(email.toLowerCase());
  }

  const mailtoMatches = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi) ?? [];
  for (const m of mailtoMatches) {
    const email = m.replace(/^mailto:/i, '').split('?')[0];
    if (isValidEmail(email)) found.add(email.toLowerCase());
  }

  return [...found];
}

function extractName(html) {
  const patterns = [
    /contact\s*(?:us\s*)?(?:at|:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /editor[\s:–-]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /written by\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'BacklinkOutreachBot/1.0 (contact research; +https://localhost)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null;
    const html = await res.text();
    return html.slice(0, 500_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function findContacts(domain, onProgress) {
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return { emails: [], contact_page: null, guest_post_url: null, contact_name: null };
  }

  const allEmails = new Set();
  let contactPage = null;
  let guestPostUrl = null;
  let contactName = null;

  const urlsToTry = [origin, ...CONTACT_PATHS.map((p) => `${origin}${p}`)];

  for (let i = 0; i < urlsToTry.length; i++) {
    const url = urlsToTry[i];
    if (onProgress) onProgress({ url, step: i + 1, total: urlsToTry.length });

    const html = await fetchPage(url);
    if (!html) {
      await sleep(DELAY_MS);
      continue;
    }

    const emails = extractEmails(html);
    emails.forEach((e) => allEmails.add(e));

    if (!contactName) contactName = extractName(html);

    const guestMatch = detectGuestPostPage(html, url);
    if (guestMatch) guestPostUrl = guestMatch;

    if (emails.length > 0 && !contactPage) {
      contactPage = url;
    }

    if (/contact|write-for-us|guest|contribute|about/i.test(url)) {
      if (!contactPage) contactPage = url;
    }

    await sleep(DELAY_MS);
  }

  const prioritized = prioritizeEmails([...allEmails]);

  return {
    emails: prioritized,
    contact_email: prioritized[0] ?? null,
    contact_page: contactPage,
    guest_post_url: guestPostUrl,
    contact_name: contactName,
  };
}

function prioritizeEmails(emails) {
  const score = (email) => {
    let s = 0;
    if (/editor|content|guest|pitch|media|press|hello|info|contact|outreach|partnerships/i.test(email)) s += 10;
    if (/support|help|admin|webmaster/i.test(email)) s += 3;
    if (/sales|billing|invoice/i.test(email)) s -= 5;
    return s;
  };
  return emails.sort((a, b) => score(b) - score(a));
}

export { extractEmails, CONTACT_PATHS };
