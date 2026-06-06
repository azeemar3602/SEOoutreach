import db from './db.js';
import {
  hashPassword, comparePassword, generateToken, hashToken, sessionExpiry,
  SESSION_COOKIE, cookieOptions,
} from './security.js';
import { logAudit } from './audit.js';

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email.trim());
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function createUser({ email, password, full_name }) {
  const password_hash = hashPassword(password);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)
  `).run(email.trim().toLowerCase(), password_hash, full_name.trim());
  return getUserById(result.lastInsertRowid);
}

export function createWorkspace({ name, site_url, plan_key = 'starter' }) {
  const result = db.prepare(`
    INSERT INTO workspaces (name, site_url, plan_key) VALUES (?, ?, ?)
  `).run(name.trim(), site_url?.trim() || null, plan_key);
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(result.lastInsertRowid);
}

export function addWorkspaceMember({ workspace_id, user_id, role }) {
  db.prepare(`
    INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)
  `).run(workspace_id, user_id, role);
}

export function getMembership(userId, workspaceId) {
  return db.prepare(`
    SELECT * FROM workspace_members WHERE user_id = ? AND workspace_id = ? AND status = 'active'
  `).get(userId, workspaceId);
}

export function getUserMemberships(userId) {
  return db.prepare(`
    SELECT wm.*, w.name AS workspace_name, w.plan_key, w.status AS workspace_status
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ? AND wm.status = 'active'
  `).all(userId);
}

export function isSuperAdmin(userId) {
  return db.prepare(`
    SELECT 1 FROM workspace_members WHERE user_id = ? AND role = 'super_admin' AND status = 'active' LIMIT 1
  `).get(userId) != null;
}

export function createSession({ userId, workspaceId, role, ip, userAgent, remember = false }) {
  const id = generateToken(24);
  const expires = sessionExpiry(remember ? 30 : 7);
  db.prepare(`
    INSERT INTO sessions (id, user_id, workspace_id, role, expires_at, last_seen_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)
  `).run(id, userId, workspaceId, role, expires, ip ?? null, userAgent ?? null);
  return { id, expires };
}

export function getSession(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  db.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?").run(sessionId);
  return row;
}

export function deleteSession(sessionId) {
  if (sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function deleteUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function createPasswordResetToken(userId) {
  const token = generateToken(32);
  const token_hash = hashToken(token);
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)
  `).run(userId, token_hash, expires);
  return token;
}

export function consumePasswordResetToken(token) {
  const token_hash = hashToken(token);
  const row = db.prepare(`
    SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL
  `).get(token_hash);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return null;
  db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
  return row;
}

export function updateUserPassword(userId, password) {
  const password_hash = hashPassword(password);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(password_hash, userId);
}

export function createEmailVerificationToken(userId) {
  const token = generateToken(32);
  const token_hash = hashToken(token);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)
  `).run(userId, token_hash, expires);
  return token;
}

export function verifyEmailToken(token) {
  const token_hash = hashToken(token);
  const row = db.prepare(`
    SELECT * FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL
  `).get(token_hash);
  if (!row || new Date(row.expires_at) < new Date()) return null;
  db.prepare("UPDATE email_verification_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
  db.prepare("UPDATE users SET email_verified_at = datetime('now') WHERE id = ?").run(row.user_id);
  return getUserById(row.user_id);
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

export function resolveAuthContext(userId) {
  if (isSuperAdmin(userId)) {
    const membership = db.prepare(`
      SELECT wm.*, w.name AS workspace_name, w.plan_key
      FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ? AND wm.role = 'super_admin' LIMIT 1
    `).get(userId);
    return {
      userId,
      role: 'super_admin',
      workspaceId: membership?.workspace_id ?? null,
      isSuperAdmin: true,
    };
  }
  const membership = db.prepare(`
    SELECT wm.*, w.name AS workspace_name, w.plan_key, w.status AS workspace_status
    FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ? AND wm.status = 'active' ORDER BY wm.id ASC LIMIT 1
  `).get(userId);
  if (!membership) return null;
  return {
    userId,
    role: membership.role,
    workspaceId: membership.workspace_id,
    isSuperAdmin: false,
  };
}

export function createSuperAdminUser({ full_name, email, password }) {
  const existing = getUserByEmail(email);
  if (existing) {
    addWorkspaceMember({ workspace_id: 1, user_id: existing.id, role: 'super_admin' });
    return existing;
  }
  const user = createUser({ email, password, full_name });
  const ws = db.prepare('SELECT id FROM workspaces ORDER BY id ASC LIMIT 1').get();
  addWorkspaceMember({ workspace_id: ws.id, user_id: user.id, role: 'super_admin' });
  logAudit({ userId: user.id, action: 'signup', metadata: { type: 'super_admin_bootstrap' } });
  return user;
}

export { SESSION_COOKIE, cookieOptions };
