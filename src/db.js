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

export function listProjects() {
  return db.prepare(`
    SELECT p.*, COUNT(o.id) AS opportunity_count
    FROM projects p
    LEFT JOIN opportunities o ON o.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();
}

export function getProject(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

export function createProject({ name, site_url, notes = '' }) {
  const result = db.prepare(
    'INSERT INTO projects (name, site_url, notes) VALUES (?, ?, ?)'
  ).run(name, site_url, notes);
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

export default db;
