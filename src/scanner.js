import { findContacts } from './contact-finder.js';
import { categorizeUrl, scoreOpportunity } from './categorize.js';
import { listOpportunities, updateOpportunity } from './db.js';

export async function scanProject(projectId, { limit = 50, linkType = null, onProgress } = {}) {
  let opps = listOpportunities(projectId, { link_type: linkType ?? undefined });
  opps = opps.filter((o) => !o.scanned_at).slice(0, limit);

  const results = { scanned: 0, found_email: 0, found_guest: 0, errors: [] };

  for (let i = 0; i < opps.length; i++) {
    const opp = opps[i];
    if (onProgress) {
      onProgress({ current: i + 1, total: opps.length, domain: opp.domain });
    }

    try {
      const contacts = await findContacts(opp.domain);

      let linkTypeFinal = opp.link_type;
      if (contacts.guest_post_url && linkTypeFinal === 'unknown') {
        linkTypeFinal = 'guest_post';
      }

      const score = scoreOpportunity({
        link_type: linkTypeFinal,
        dr: opp.dr,
        is_dofollow: opp.is_dofollow,
        contact_email: contacts.contact_email,
      });

      updateOpportunity(opp.id, {
        contact_email: contacts.contact_email,
        contact_page: contacts.contact_page,
        contact_name: contacts.contact_name,
        guest_post_url: contacts.guest_post_url,
        link_type: linkTypeFinal,
        score,
        scanned_at: new Date().toISOString(),
      });

      results.scanned++;
      if (contacts.contact_email) results.found_email++;
      if (contacts.guest_post_url) results.found_guest++;
    } catch (err) {
      results.errors.push(`${opp.domain}: ${err.message}`);
      updateOpportunity(opp.id, { scanned_at: new Date().toISOString() });
    }
  }

  return results;
}

export async function scanSingleDomain(domain) {
  return findContacts(domain);
}
