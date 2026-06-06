import db from './db.js';
import { seedPlans } from './plans.js';
import { createSuperAdminUser } from './auth-store.js';

function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      email_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      site_url TEXT,
      plan_key TEXT NOT NULL DEFAULT 'starter',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workspace_id, user_id),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      workspace_id INTEGER,
      role TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plans (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      monthly_price INTEGER,
      project_limit INTEGER,
      user_limit INTEGER,
      opportunity_limit INTEGER,
      scan_limit_monthly INTEGER,
      extension_enabled INTEGER NOT NULL DEFAULT 0,
      export_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_counters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      scans_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      UNIQUE(workspace_id, period),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspace_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
  `);

  if (!columnExists('projects', 'workspace_id')) {
    db.exec('ALTER TABLE projects ADD COLUMN workspace_id INTEGER');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id)');

  seedPlans();

  const wsCount = db.prepare('SELECT COUNT(*) AS c FROM workspaces').get().c;
  if (wsCount === 0) {
    const result = db.prepare(`
      INSERT INTO workspaces (name, site_url, plan_key) VALUES ('Default Workspace', NULL, 'agency')
    `).run();
    db.prepare('UPDATE projects SET workspace_id = ? WHERE workspace_id IS NULL').run(result.lastInsertRowid);
  } else {
    const defaultWs = db.prepare('SELECT id FROM workspaces ORDER BY id ASC LIMIT 1').get();
    db.prepare('UPDATE projects SET workspace_id = ? WHERE workspace_id IS NULL').run(defaultWs.id);
  }
}

export function bootstrapSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';
  if (!email || !password) return;

  const existingSuper = db.prepare(`
    SELECT u.id FROM users u
    JOIN workspace_members wm ON wm.user_id = u.id
    WHERE wm.role = 'super_admin' LIMIT 1
  `).get();
  if (existingSuper) return;

  createSuperAdminUser({ full_name: name, email, password });
  console.log(`Super Admin bootstrapped: ${email}`);
}
