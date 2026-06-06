import { Router } from 'express';
import {
  getAdminStats, listAllWorkspaces, getWorkspace, updateWorkspace,
  listAllUsers, updateUserStatus, updateMemberRole,
} from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { listAuditLogs } from '../audit.js';
import { logAudit } from '../audit.js';
import db from '../db.js';

const router = Router();

router.use(requireAuth, requireRole(['super_admin']));

router.get('/stats', (_req, res) => {
  res.json(getAdminStats());
});

router.get('/workspaces', (_req, res) => {
  res.json(listAllWorkspaces());
});

router.get('/workspaces/:id', (req, res) => {
  const ws = getWorkspace(parseInt(req.params.id, 10));
  if (!ws) return res.status(404).json({ error: 'Workspace not found.' });
  res.json(ws);
});

router.patch('/workspaces/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const allowed = {};
  if (req.body.name) allowed.name = req.body.name.trim();
  if (req.body.status) allowed.status = req.body.status;
  if (req.body.site_url !== undefined) allowed.site_url = req.body.site_url;

  const ws = updateWorkspace(id, allowed);
  if (req.body.status === 'suspended') {
    logAudit({ workspaceId: id, userId: req.auth.userId, action: 'workspace_suspended' });
  }
  res.json(ws);
});

router.patch('/workspaces/:id/plan', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { plan_key } = req.body;
  if (!plan_key) return res.status(400).json({ error: 'plan_key required.' });

  const plan = db.prepare('SELECT key FROM plans WHERE key = ?').get(plan_key);
  if (!plan) return res.status(400).json({ error: 'Invalid plan.' });

  const ws = updateWorkspace(id, { plan_key });
  logAudit({
    workspaceId: id,
    userId: req.auth.userId,
    action: 'plan_changed',
    metadata: { plan_key },
  });
  res.json(ws);
});

router.get('/users', (_req, res) => {
  res.json(listAllUsers());
});

router.patch('/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.body.status) {
    updateUserStatus(id, req.body.status);
  }
  if (req.body.role && req.body.workspace_id) {
    const member = db.prepare(`
      SELECT id FROM workspace_members WHERE user_id = ? AND workspace_id = ?
    `).get(id, req.body.workspace_id);
    if (member) updateMemberRole(member.id, req.body.role);
  }
  res.json({ ok: true });
});

router.get('/audit-logs', (req, res) => {
  const limit = parseInt(req.query.limit ?? '100', 10);
  res.json(listAuditLogs({ limit }));
});

export default router;
