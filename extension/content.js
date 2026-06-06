function extractEmailsFromPage() {
  const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const blocked = ['example.com', 'sentry.io', 'wixpress.com', 'gravatar.com', 'schema.org'];
  const found = new Set();

  const text = document.body?.innerText ?? '';
  const html = document.documentElement?.innerHTML ?? '';
  const combined = text + ' ' + html;

  for (const match of combined.match(EMAIL_REGEX) ?? []) {
    const domain = match.split('@')[1]?.toLowerCase();
    if (!domain || blocked.some((b) => domain.includes(b))) continue;
    if (match.includes('noreply') || match.includes('.png')) continue;
    found.add(match.toLowerCase());
  }

  document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
    const email = a.href.replace(/^mailto:/i, '').split('?')[0];
    if (email.includes('@')) found.add(email.toLowerCase());
  });

  return [...found];
}

function detectGuestPostPage() {
  const url = location.href.toLowerCase();
  const text = document.body?.innerText?.slice(0, 5000)?.toLowerCase() ?? '';
  const hints = ['guest post', 'write for us', 'contribute', 'author guidelines', 'submission guidelines', 'pitch us'];
  const urlHints = ['guest-post', 'write-for-us', 'contribute', 'submit', 'author'];

  const urlMatch = urlHints.some((h) => url.includes(h));
  const contentMatch = hints.some((h) => text.includes(h));
  return urlMatch || contentMatch;
}

function detectLinkType() {
  const combined = (location.href + ' ' + (document.title ?? '')).toLowerCase();
  if (/guest|write-for-us|contribute|author/i.test(combined)) return 'guest_post';
  if (/resource|useful-link|recommended/i.test(combined)) return 'resource_page';
  if (/directory|listing|submit-site/i.test(combined)) return 'directory';
  if (/forum|community|discuss/i.test(combined)) return 'forum';
  if (/blog|news|article|magazine/i.test(combined)) return 'editorial';
  return 'unknown';
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'scanPage') {
    sendResponse({
      url: location.href,
      domain: location.hostname.replace(/^www\./, ''),
      title: document.title,
      emails: extractEmailsFromPage(),
      isGuestPostPage: detectGuestPostPage(),
      linkType: detectLinkType(),
    });
  }
  return true;
});
