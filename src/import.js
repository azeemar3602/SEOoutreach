import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { extractDomain, categorizeUrl, scoreOpportunity } from './categorize.js';
import { upsertOpportunity } from './db.js';

const COLUMN_MAP = {
  'referring page url': 'source_url',
  'referring page': 'source_url',
  'source url': 'source_url',
  'url from': 'source_url',
  'referring url': 'source_url',
  'page url': 'source_url',
  'target url': 'target_url',
  'url to': 'target_url',
  'landing page': 'target_url',
  'anchor': 'anchor_text',
  'anchor text': 'anchor_text',
  'domain rating': 'dr',
  'dr': 'dr',
  'domain rank': 'dr',
  'type': 'link_type_raw',
  'link type': 'link_type_raw',
  'dofollow': 'dofollow_raw',
  'follow type': 'dofollow_raw',
};

function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/[_\-]+/g, ' ');
}

function mapRow(headers, row) {
  const mapped = {};
  headers.forEach((h, i) => {
    const key = COLUMN_MAP[normalizeHeader(h)];
    if (key && row[i]) mapped[key] = row[i].trim();
  });
  return mapped;
}

function parseDofollow(val) {
  if (!val) return 1;
  const v = val.toLowerCase();
  if (v === 'nofollow' || v === 'no' || v === 'false' || v === '0') return 0;
  return 1;
}

function parseDr(val) {
  if (!val) return null;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
}

export function importCsv(filePath, projectId) {
  const raw = readFileSync(filePath, 'utf-8');
  const records = parse(raw, { relax_column_count: true, skip_empty_lines: true });

  if (records.length < 2) {
    throw new Error('CSV must have a header row and at least one data row');
  }

  const headers = records[0];
  const rows = records.slice(1);
  const results = { imported: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    try {
      const data = mapRow(headers, row);
      const sourceUrl = data.source_url;
      if (!sourceUrl) {
        results.skipped++;
        continue;
      }

      const domain = extractDomain(sourceUrl);
      const linkType = categorizeUrl(sourceUrl, data.anchor_text ?? '');
      const dr = parseDr(data.dr);
      const isDofollow = parseDofollow(data.dofollow_raw);
      const score = scoreOpportunity({ link_type: linkType, dr, is_dofollow });

      upsertOpportunity({
        project_id: projectId,
        source_url: sourceUrl,
        target_url: data.target_url ?? null,
        domain,
        link_type: linkType,
        dr,
        is_dofollow: isDofollow,
        anchor_text: data.anchor_text ?? null,
        score,
      });
      results.imported++;
    } catch (err) {
      results.errors.push(err.message);
    }
  }

  return results;
}

export function importUrlList(urls, projectId) {
  const results = { imported: 0, skipped: 0, errors: [] };

  for (const line of urls) {
    const sourceUrl = line.trim();
    if (!sourceUrl || !sourceUrl.startsWith('http')) {
      results.skipped++;
      continue;
    }
    try {
      const domain = extractDomain(sourceUrl);
      const linkType = categorizeUrl(sourceUrl);
      const score = scoreOpportunity({ link_type: linkType, dr: null, is_dofollow: 1 });

      upsertOpportunity({
        project_id: projectId,
        source_url: sourceUrl,
        domain,
        link_type: linkType,
        score,
      });
      results.imported++;
    } catch (err) {
      results.errors.push(err.message);
    }
  }

  return results;
}
