import db from './db.js';

export function logAudit({ workspaceId, userId, action, entityType = null, entityId = null, metadata = null }) {
  db.prepare(`
    INSERT INTO audit_logs (workspace_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    workspaceId ?? null,
    userId ?? null,
    action,
    entityType,
    entityId != null ? String(entityId) : null,
    metadata ? JSON.stringify(metadata) : null
  );
}

export function listAuditLogs({ workspaceId = null, limit = 100 } = {}) {
  if (workspaceId) {
    return db.prepare(`
      SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(workspaceId, limit);
  }
  return db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit);
}
