import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ?? join(__dirname, '..', 'data');
const DB_PATH = join(dataDir, 'outreach.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER,
    name TEXT NOT NULL,
    site_url TEXT NOT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    source_url TEXT NOT NULL,
    target_url TEXT,
    domain TEXT NOT NULL,
    link_type TEXT DEFAULT 'unknown',
    dr INTEGER,
    is_dofollow INTEGER DEFAULT 1,
    anchor_text TEXT,
    contact_email TEXT,
    contact_page TEXT,
    contact_name TEXT,
    guest_post_url TEXT,
    status TEXT DEFAULT 'new',
    notes TEXT DEFAULT '',
    score INTEGER DEFAULT 0,
    scanned_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, source_url)
  );

  CREATE INDEX IF NOT EXISTS idx_opportunities_project ON opportunities(project_id);
  CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
  CREATE INDEX IF NOT EXISTS idx_opportunities_domain ON opportunities(domain);
`);

function wsFilter(workspaceId, isSuperAdmin) {
  if (isSuperAdmin || workspaceId == null) return { clause: '', params: [] };
  return { clause: ' AND p.workspace_id = ?', params: [workspaceId] };
}

export function listProjects(workspaceId, isSuperAdmin = false) {
  const { clause, params } = wsFilter(workspaceId, isSuperAdmin);
  return db.prepare(`
    SELECT p.*, COUNT(o.id) AS opportunity_count
    FROM projects p
    LEFT JOIN opportunities o ON o.project_id = p.id
    WHERE 1=1 ${clause}
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(...params);
}

export function getProject(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

export function createProject({ workspace_id, name, site_url, notes = '' }) {
  const result = db.prepare(
    'INSERT INTO projects (workspace_id, name, site_url, notes) VALUES (?, ?, ?, ?)'
  ).run(workspace_id, name, site_url, notes);
  return getProject(result.lastInsertRowid);
}

export function deleteProject(id) {
  db.prepare('DELETE FROM opportunities WHERE project_id = ?').run(id);
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function listOpportunities(projectId, filters = {}) {
  let sql = 'SELECT * FROM opportunities WHERE project_id = ?';
  const params = [projectId];

  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.link_type) {
    sql += ' AND link_type = ?';
    params.push(filters.link_type);
  }
  if (filters.has_contact) {
    sql += ' AND contact_email IS NOT NULL AND contact_email != ""';
  }

  sql += ' ORDER BY score DESC, created_at DESC';
  return db.prepare(sql).all(...params);
}

export function getOpportunity(id) {
  return db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
}

export function upsertOpportunity(data) {
  const existing = db.prepare(
    'SELECT id FROM opportunities WHERE project_id = ? AND source_url = ?'
  ).get(data.project_id, data.source_url);

  if (existing) {
    const fields = ['target_url', 'domain', 'link_type', 'dr', 'is_dofollow', 'anchor_text', 'score'];
    const updates = fields.filter((f) => data[f] !== undefined);
    if (updates.length === 0) return getOpportunity(existing.id);

    const set = updates.map((f) => `${f} = ?`).join(', ');
    db.prepare(`UPDATE opportunities SET ${set} WHERE id = ?`).run(
      ...updates.map((f) => data[f]),
      existing.id
    );
    return getOpportunity(existing.id);
  }

  const result = db.prepare(`
    INSERT INTO opportunities (
      project_id, source_url, target_url, domain, link_type, dr,
      is_dofollow, anchor_text, score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.project_id,
    data.source_url,
    data.target_url ?? null,
    data.domain,
    data.link_type ?? 'unknown',
    data.dr ?? null,
    data.is_dofollow ?? 1,
    data.anchor_text ?? null,
    data.score ?? 0
  );
  return getOpportunity(result.lastInsertRowid);
}

export function updateOpportunity(id, data) {
  const allowed = [
    'status', 'notes', 'contact_email', 'contact_page', 'contact_name',
    'guest_post_url', 'link_type', 'score', 'scanned_at'
  ];
  const updates = allowed.filter((f) => data[f] !== undefined);
  if (updates.length === 0) return getOpportunity(id);

  const set = updates.map((f) => `${f} = ?`).join(', ');
  db.prepare(`UPDATE opportunities SET ${set} WHERE id = ?`).run(
    ...updates.map((f) => data[f]),
    id
  );
  return getOpportunity(id);
}

export function deleteOpportunity(id) {
  return db.prepare('DELETE FROM opportunities WHERE id = ?').run(id);
}

export function getStats(projectId) {
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
      SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) AS replied,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN contact_email IS NOT NULL AND contact_email != '' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN link_type = 'guest_post' THEN 1 ELSE 0 END) AS guest_post
    FROM opportunities WHERE project_id = ?
  `).get(projectId);
}

export function listAllWorkspaces() {
  return db.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.status = 'active') AS member_count,
      (SELECT COUNT(*) FROM projects p WHERE p.workspace_id = w.id) AS project_count
    FROM workspaces w ORDER BY w.created_at DESC
  `).all();
}

export function getWorkspace(id) {
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
}

export function updateWorkspace(id, data) {
  const allowed = ['name', 'site_url', 'plan_key', 'status'];
  const updates = allowed.filter((f) => data[f] !== undefined);
  if (!updates.length) return getWorkspace(id);
  const set = updates.map((f) => `${f} = ?`).join(', ');
  db.prepare(`UPDATE workspaces SET ${set}, updated_at = datetime('now') WHERE id = ?`).run(
    ...updates.map((f) => data[f]),
    id
  );
  return getWorkspace(id);
}

export function listWorkspaceMembers(workspaceId) {
  return db.prepare(`
    SELECT wm.*, u.email, u.full_name, u.email_verified_at
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ?
    ORDER BY wm.created_at ASC
  `).all(workspaceId);
}

export function listAllUsers() {
  return db.prepare(`
    SELECT u.id, u.email, u.full_name, u.status, u.email_verified_at, u.created_at,
      GROUP_CONCAT(wm.role || '@' || w.name) AS memberships
    FROM users u
    LEFT JOIN workspace_members wm ON wm.user_id = u.id
    LEFT JOIN workspaces w ON w.id = wm.workspace_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
}

export function updateUserStatus(userId, status) {
  db.prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, userId);
}

export function updateMemberRole(memberId, role) {
  db.prepare('UPDATE workspace_members SET role = ? WHERE id = ?').run(role, memberId);
}

export function removeMember(memberId) {
  db.prepare("UPDATE workspace_members SET status = 'removed' WHERE id = ?").run(memberId);
}

export function getMemberById(id) {
  return db.prepare('SELECT * FROM workspace_members WHERE id = ?').get(id);
}

export function getAdminStats() {
  const workspaces = db.prepare('SELECT COUNT(*) AS c FROM workspaces').get().c;
  const activeWs = db.prepare("SELECT COUNT(*) AS c FROM workspaces WHERE status = 'active'").get().c;
  const suspendedWs = db.prepare("SELECT COUNT(*) AS c FROM workspaces WHERE status = 'suspended'").get().c;
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const projects = db.prepare('SELECT COUNT(*) AS c FROM projects').get().c;
  const opportunities = db.prepare('SELECT COUNT(*) AS c FROM opportunities').get().c;
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
  const scans = db.prepare('SELECT COALESCE(SUM(scans_used),0) AS c FROM usage_counters WHERE period = ?').get(period).c;
  const planCounts = db.prepare(`
    SELECT plan_key, COUNT(*) AS c FROM workspaces GROUP BY plan_key
  `).all();
  const byPlan = Object.fromEntries(planCounts.map((r) => [r.plan_key, r.c]));
  return {
    total_workspaces: workspaces,
    active_workspaces: activeWs,
    suspended_workspaces: suspendedWs,
    total_users: users,
    starter_users: byPlan.starter ?? 0,
    pro_users: byPlan.pro ?? 0,
    agency_users: byPlan.agency ?? 0,
    enterprise_users: byPlan.enterprise ?? 0,
    total_projects: projects,
    total_opportunities: opportunities,
    scans_this_month: scans,
  };
}

export default db;
