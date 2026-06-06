import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { writeFileSync, unlinkSync } from 'fs';

import {
  listProjects, createProject, deleteProject, getProject,
  listOpportunities, updateOpportunity, deleteOpportunity, getStats,
  upsertOpportunity,
} from './db.js';
import { importCsv, importUrlList } from './import.js';
import { scanProject, scanSingleDomain } from './scanner.js';
import { extractDomain, categorizeUrl, scoreOpportunity } from './categorize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3847;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'backlink-outreach-tool' });
});

const scanJobs = new Map();

app.get('/api/projects', (_req, res) => {
  res.json(listProjects());
});

app.post('/api/projects', (req, res) => {
  const { name, site_url, notes } = req.body;
  if (!name || !site_url) return res.status(400).json({ error: 'name and site_url required' });
  res.json(createProject({ name, site_url, notes }));
});

app.delete('/api/projects/:id', (req, res) => {
  deleteProject(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

app.get('/api/projects/:id/stats', (req, res) => {
  res.json(getStats(parseInt(req.params.id, 10)));
});

app.get('/api/projects/:id/opportunities', (req, res) => {
  const filters = {};
  if (req.query.status) filters.status = req.query.status;
  if (req.query.link_type) filters.link_type = req.query.link_type;
  if (req.query.has_contact === '1') filters.has_contact = true;
  res.json(listOpportunities(parseInt(req.params.id, 10), filters));
});

app.patch('/api/opportunities/:id', (req, res) => {
  res.json(updateOpportunity(parseInt(req.params.id, 10), req.body));
});

app.delete('/api/opportunities/:id', (req, res) => {
  deleteOpportunity(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

app.post('/api/projects/:id/import-csv', (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'csv content required' });

  const tmp = join(tmpdir(), `import-${Date.now()}.csv`);
  writeFileSync(tmp, csv);
  try {
    const result = importCsv(tmp, parseInt(req.params.id, 10));
    res.json(result);
  } finally {
    unlinkSync(tmp);
  }
});

app.post('/api/projects/:id/import-urls', (req, res) => {
  const { urls } = req.body;
  if (!urls?.length) return res.status(400).json({ error: 'urls array required' });
  res.json(importUrlList(urls, parseInt(req.params.id, 10)));
});

app.post('/api/projects/:id/scan', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const { limit = 25, link_type = null } = req.body ?? {};
  const jobId = `scan-${projectId}-${Date.now()}`;

  scanJobs.set(jobId, { status: 'running', progress: null, result: null });

  res.json({ jobId });

  scanProject(projectId, {
    limit,
    linkType: link_type,
    onProgress: (p) => scanJobs.set(jobId, { status: 'running', progress: p, result: null }),
  }).then((result) => {
    scanJobs.set(jobId, { status: 'done', progress: null, result });
  }).catch((err) => {
    scanJobs.set(jobId, { status: 'error', error: err.message });
  });
});

app.get('/api/scan/:jobId', (req, res) => {
  const job = scanJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(job);
});

app.post('/api/find-contacts', async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain required' });
  try {
    const result = await scanSingleDomain(domain);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/:id/capture', (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const { source_url, contact_email, contact_page, guest_post_url, contact_name, link_type, notes } = req.body;
  if (!source_url) return res.status(400).json({ error: 'source_url required' });

  const domain = extractDomain(source_url);
  const lt = link_type ?? categorizeUrl(source_url);
  const score = scoreOpportunity({ link_type: lt, contact_email });

  const opp = upsertOpportunity({
    project_id: projectId,
    source_url,
    domain,
    link_type: lt,
    score,
  });

  const updated = updateOpportunity(opp.id, {
    contact_email: contact_email ?? null,
    contact_page: contact_page ?? null,
    guest_post_url: guest_post_url ?? null,
    contact_name: contact_name ?? null,
    notes: notes ?? '',
    scanned_at: new Date().toISOString(),
  });

  res.json(updated);
});

app.get('/api/projects/:id/export', (req, res) => {
  const opps = listOpportunities(parseInt(req.params.id, 10));
  const headers = [
    'domain', 'source_url', 'link_type', 'dr', 'contact_email',
    'contact_name', 'guest_post_url', 'contact_page', 'status', 'score', 'notes'
  ];
  const lines = [headers.join(',')];
  for (const o of opps) {
    lines.push(headers.map((h) => `"${(o[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=outreach-export.csv');
  res.send(lines.join('\n'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Backlink Outreach Tool running on port ${PORT}\n`);
});
