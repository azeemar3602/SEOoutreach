import { Router } from 'express';
import db from '../db.js';
import {
  getWorkspace, updateWorkspace, listWorkspaceMembers, getMemberById,
  updateMemberRole, removeMember,
} from '../db.js';
import {
  requireAuth, requireRole, requireWorkspaceAccess, attachUsage,
} from '../auth.js';
import { getWorkspaceUsage } from '../plans.js';
import { validateEmail, validateRole } from '../validation.js';
import { generateToken, hashToken } from '../security.js';
import { logAudit } from '../audit.js';
import { checkPlanLimit } from '../plans.js';

const router = Router();

router.use(requireAuth, requireWorkspaceAccess, attachUsage);

router.get('/', (req, res) => {
  const ws = getWorkspace(req.auth.workspaceId);
  if (!ws) return res.status(404).json({ error: 'Workspace not found.' });
  res.json(ws);
});

router.patch('/', requireRole(['workspace_admin']), (req, res) => {
  const { name, site_url } = req.body;
  const data = {};
  if (name?.trim()) data.name = name.trim();
  if (site_url !== undefined) data.site_url = site_url?.trim() || null;
  const ws = updateWorkspace(req.auth.workspaceId, data);
  res.json(ws);
});

router.get('/members', (req, res) => {
  res.json(listWorkspaceMembers(req.auth.workspaceId));
});

router.post('/invite', requireRole(['workspace_admin']), (req, res) => {
  const emailErr = validateEmail(req.body.email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  if (!validateRole(req.body.role ?? 'member')) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  const limitCheck = checkPlanLimit(req.auth.workspaceId, 'user');
  if (!limitCheck.ok) return res.status(403).json({ error: limitCheck.message });

  const token = generateToken(32);
  const token_hash = hashToken(token);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO workspace_invites (workspace_id, email, role, token_hash, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.auth.workspaceId,
    req.body.email.trim().toLowerCase(),
    req.body.role ?? 'member',
    token_hash,
    expires,
    req.auth.userId
  );

  if (process.env.NODE_ENV !== 'production') {
    const base = `${req.protocol}://${req.get('host')}`;
    console.log(`[dev] Accept invite: ${base}/accept-invite?token=${token}`);
  }

  logAudit({
    workspaceId: req.auth.workspaceId,
    userId: req.auth.userId,
    action: 'user_invited',
    metadata: { email: req.body.email },
  });

  res.json({ ok: true, message: 'Invite created.' });
});

router.patch('/members/:id', requireRole(['workspace_admin']), (req, res) => {
  const member = getMemberById(parseInt(req.params.id, 10));
  if (!member || member.workspace_id !== req.auth.workspaceId) {
    return res.status(404).json({ error: 'Member not found.' });
  }
  if (!validateRole(req.body.role)) return res.status(400).json({ error: 'Invalid role.' });
  if (member.role === 'super_admin') return res.status(403).json({ error: 'Cannot change super admin role.' });

  updateMemberRole(member.id, req.body.role);
  logAudit({
    workspaceId: req.auth.workspaceId,
    userId: req.auth.userId,
    action: 'user_role_changed',
    entityType: 'workspace_member',
    entityId: member.id,
    metadata: { role: req.body.role },
  });
  res.json({ ok: true });
});

router.delete('/members/:id', requireRole(['workspace_admin']), (req, res) => {
  const member = getMemberById(parseInt(req.params.id, 10));
  if (!member || member.workspace_id !== req.auth.workspaceId) {
    return res.status(404).json({ error: 'Member not found.' });
  }
  if (member.user_id === req.auth.userId) {
    return res.status(400).json({ error: 'You cannot remove yourself.' });
  }

  removeMember(member.id);
  res.json({ ok: true });
});

router.get('/usage', (req, res) => {
  res.json(getWorkspaceUsage(req.auth.workspaceId));
});

export default router;
