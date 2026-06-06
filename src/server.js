import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { writeFileSync, unlinkSync } from 'fs';

import { runMigrations, bootstrapSuperAdmin } from './migrate.js';
import {
  listProjects, createProject, deleteProject,
  listOpportunities, updateOpportunity, deleteOpportunity, getStats,
  upsertOpportunity,
} from './db.js';
import { importCsv, importUrlList } from './import.js';
import { scanProject, scanSingleDomain } from './scanner.js';
import { extractDomain, categorizeUrl, scoreOpportunity } from './categorize.js';
import { listPlans, incrementScansUsed, getWorkspacePlan, checkPlanLimit } from './plans.js';
import {
  requireAuth, requireRole, assertProjectAccess, assertOpportunityAccess,
  enforcePlanLimit, attachUsage,
} from './auth.js';
import { logAudit } from './audit.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspace.js';
import adminRoutes from './routes/admin.js';

runMigrations();
bootstrapSuperAdmin();

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const app = express();
const PORT = process.env.PORT ?? 3847;

const pageRoutes = {
  '/login': 'login.html',
  '/signup': 'signup.html',
  '/pricing': 'pricing.html',
  '/forgot-password': 'forgot-password.html',
  '/reset-password': 'reset-password.html',
  '/verify-email': 'verify-email.html',
  '/dashboard': 'dashboard.html',
  '/admin': 'admin.html',
  '/settings': 'settings.html',
};

for (const [route, file] of Object.entries(pageRoutes)) {
  app.get(route, (_req, res) => {
    res.sendFile(join(publicDir, file));
  });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(publicDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'backlink-outreach-tool' });
});

app.get('/api/plans', (_req, res) => {
  res.json(listPlans());
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/admin', adminRoutes);

const scanJobs = new Map();

app.get('/api/projects', requireAuth, attachUsage, (req, res) => {
  res.json(listProjects(req.auth.workspaceId, req.auth.isSuperAdmin));
});

app.post('/api/projects', requireAuth, requireRole(['workspace_admin', 'member']), enforcePlanLimit('project'), (req, res) => {
  const { name, site_url, notes } = req.body;
  if (!name || !site_url) return res.status(400).json({ error: 'name and site_url required' });

  const workspaceId = req.auth.isSuperAdmin
    ? (req.body.workspace_id ?? req.auth.workspaceId)
    : req.auth.workspaceId;

  if (!workspaceId) return res.status(400).json({ error: 'workspace_id required' });

  const project = createProject({ workspace_id: workspaceId, name, site_url, notes });
  logAudit({
    workspaceId,
    userId: req.auth.userId,
    action: 'project_created',
    entityType: 'project',
    entityId: project.id,
  });
  res.json(project);
});

app.delete('/api/projects/:id', requireAuth, requireRole(['workspace_admin']), (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const access = assertProjectAccess(projectId, req.auth);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  deleteProject(projectId);
  logAudit({
    workspaceId: access.project.workspace_id,
    userId: req.auth.userId,
    action: 'project_deleted',
    entityType: 'project',
    entityId: projectId,
  });
  res.json({ ok: true });
});

app.get('/api/projects/:id/stats', requireAuth, (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const access = assertProjectAccess(projectId, req.auth);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  res.json(getStats(projectId));
});

app.get('/api/projects/:id/opportunities', requireAuth, (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const access = assertProjectAccess(projectId, req.auth);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const filters = {};
  if (req.query.status) filters.status = req.query.status;
  if (req.query.link_type) filters.link_type = req.query.link_type;
  if (req.query.has_contact === '1') filters.has_contact = true;
  res.json(listOpportunities(projectId, filters));
});

app.patch('/api/opportunities/:id', requireAuth, requireRole(['workspace_admin', 'member']), (req, res) => {
  const oppId = parseInt(req.params.id, 10);
  const access = assertOpportunityAccess(oppId, req.auth);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const allowed = req.auth.role === 'member'
    ? ['status', 'notes', 'contact_email', 'contact_page', 'contact_name', 'guest_post_url']
    : undefined;

  const data = { ...req.body };
  if (allowed) {
    for (const key of Object.keys(data)) {
      if (!allowed.includes(key)) delete data[key];
    }
  }

  res.json(updateOpportunity(oppId, data));
});

app.delete('/api/opportunities/:id', requireAuth, requireRole(['workspace_admin']), (req, res) => {
  const oppId = parseInt(req.params.id, 10);
  const access = assertOpportunityAccess(oppId, req.auth);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  deleteOpportunity(oppId);
  logAudit({
    workspaceId: access.project.workspace_id,
    userId: req.auth.userId,
    action: 'opportunity_deleted',
    entityType: 'opportunity',
    entityId: oppId,
  });
  res.json({ ok: true });
});

app.post('/api/projects/:id/import-csv', requireAuth, requireRole(['workspace_admin', 'member']), (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const access = assertProjectAccess(projectId, req.auth);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'csv content required' });

  if (!req.auth.isSuperAdmin) {
    const rowCount = Math.max(0, csv.split('\n').length - 1);
    const limitCheck = checkPlanLimit(access.project.workspace_id, 'opportunity', rowCount || 1);
    if (!limitCheck.ok) return res.status(403).json({ error: limitCheck.message });
  }

  const tmp = join(tmpdir(), `import-${Date.now()}.csv`);
  writeFileSync(tmp, csv);
  try {
    const result = importCsv(tmp, projectId);
    res.json(result);
  } finally {
    unlinkSync(tmp);
  }
});

app.post('/api/projects/:id/import-urls', requireAuth, requireRole(['workspace_admin', 'member']), (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const access = assertProjectAccess(projectId, req.auth);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const { urls } = req.body;
  if (!urls?.length) return res.status(400).json({ error: 'urls array required' });

  if (!req.auth.isSuperAdmin) {
    const limitCheck = checkPlanLimit(access.project.workspace_id, 'opportunity', urls.length);
    if (!limitCheck.ok) return res.status(403).json({ error: limitCheck.message });
  }

  res.json(importUrlList(urls, projectId));
});

app.post('/api/projects/:id/scan', requireAuth, requireRole(['workspace_admin', 'member']), async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const access = assertProjectAccess(projectId, req.auth);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const { limit = 25, link_type = null } = req.body ?? {};

  if (!req.auth.isSuperAdmin) {
    const limitCheck = checkPlanLimit(access.project.workspace_id, 'scan', limit);
    if (!limitCheck.ok) return res.status(403).json({ error: limitCheck.message });
  }

  const jobId = `scan-${projectId}-${Date.now()}`;
  scanJobs.set(jobId, { status: 'running', progress: null, result: null });
  res.json({ jobId });

  scanProject(projectId, {
    limit,
    linkType: link_type,
    onProgress: (p) => scanJobs.set(jobId, { status: 'running', progress: p, result: null }),
  }).then((result) => {
    if (!req.auth.isSuperAdmin && access.project.workspace_id) {
      incrementScansUsed(access.project.workspace_id, result.scanned);
    }
    scanJobs.set(jobId, { status: 'done', progress: null, result });
  }).catch((err) => {
    scanJobs.set(jobId, { status: 'error', error: err.message });
  });
});

app.get('/api/scan/:jobId', requireAuth, (req, res) => {
  const job = scanJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(job);
});

app.post('/api/find-contacts', requireAuth, requireRole(['workspace_admin', 'member']), async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain required' });

  if (!req.auth.isSuperAdmin && req.auth.workspaceId) {
    const limitCheck = checkPlanLimit(req.auth.workspaceId, 'scan', 1);
    if (!limitCheck.ok) return res.status(403).json({ error: limitCheck.message });
  }

  try {
    const result = await scanSingleDomain(domain);
    if (!req.auth.isSuperAdmin && req.auth.workspaceId) {
      incrementScansUsed(req.auth.workspaceId, 1);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/:id/capture', requireAuth, requireRole(['workspace_admin', 'member']), (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const access = assertProjectAccess(projectId, req.auth);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  if (!req.auth.isSuperAdmin && req.auth.workspaceId) {
    const plan = getWorkspacePlan(req.auth.workspaceId);
    if (!plan?.extension_enabled) {
      return res.status(403).json({
        error: 'Chrome extension capture is not available on your plan. Please upgrade to Pro or higher.',
      });
    }
    const limitCheck = checkPlanLimit(req.auth.workspaceId, 'opportunity', 1);
    if (!limitCheck.ok) return res.status(403).json({ error: limitCheck.message });
  }

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

app.get('/api/projects/:id/export', requireAuth, requireRole(['workspace_admin', 'member']), (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const access = assertProjectAccess(projectId, req.auth);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  if (!req.auth.isSuperAdmin && req.auth.workspaceId) {
    const plan = getWorkspacePlan(req.auth.workspaceId);
    if (plan?.export_enabled === 0) {
      return res.status(403).json({ error: 'CSV export is not available on your plan.' });
    }
  }

  const opps = listOpportunities(projectId);
  const headers = [
    'domain', 'source_url', 'link_type', 'dr', 'contact_email',
    'contact_name', 'guest_post_url', 'contact_page', 'status', 'score', 'notes',
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
