import {
  getSession, resolveAuthContext, sanitizeUser, getUserById, SESSION_COOKIE,
} from './auth-store.js';
import { getWorkspaceUsage, checkPlanLimit } from './plans.js';
import { getOpportunity } from './db.js';
import db from './db.js';

export function requireAuth(req, res, next) {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  const session = getSession(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const ctx = resolveAuthContext(session.user_id);
  if (!ctx) {
    return res.status(403).json({ error: 'No active workspace membership.' });
  }

  req.user = sanitizeUser(getUserById(session.user_id));
  req.auth = { ...ctx, sessionId: session.id };
  next();
}

export function optionalAuth(req, res, next) {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  const session = getSession(sessionId);
  if (session) {
    const ctx = resolveAuthContext(session.user_id);
    if (ctx) {
      req.user = sanitizeUser(getUserById(session.user_id));
      req.auth = { ...ctx, sessionId: session.id };
    }
  }
  next();
}

export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required.' });
    if (req.auth.isSuperAdmin && allowed.includes('super_admin')) return next();
    if (allowed.includes(req.auth.role)) return next();
    return res.status(403).json({ error: 'Insufficient permissions.' });
  };
}

export function requireWorkspaceAccess(req, res, next) {
  if (req.auth?.isSuperAdmin) return next();
  if (!req.auth?.workspaceId) return res.status(403).json({ error: 'Workspace access required.' });
  next();
}

export function assertProjectAccess(projectId, auth) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return { ok: false, status: 404, error: 'Project not found.' };
  if (auth.isSuperAdmin) return { ok: true, project };
  if (project.workspace_id !== auth.workspaceId) {
    return { ok: false, status: 403, error: 'Access denied.' };
  }
  return { ok: true, project };
}

export function attachUsage(req, res, next) {
  if (req.auth?.workspaceId && !req.auth.isSuperAdmin) {
    req.usage = getWorkspaceUsage(req.auth.workspaceId);
  }
  next();
}

export function assertOpportunityAccess(oppId, auth) {
  const opp = getOpportunity(oppId);
  if (!opp) return { ok: false, status: 404, error: 'Opportunity not found.' };
  return assertProjectAccess(opp.project_id, auth);
}

export function enforcePlanLimit(type, getExtra = () => 1) {
  return (req, res, next) => {
    if (req.auth?.isSuperAdmin) return next();
    const workspaceId = req.auth?.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace required.' });
    const extra = typeof getExtra === 'function' ? getExtra(req) : getExtra;
    const check = checkPlanLimit(workspaceId, type, extra);
    if (!check.ok) return res.status(403).json({ error: check.message });
    next();
  };
}
