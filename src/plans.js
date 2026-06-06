import db from './db.js';

const PLANS = [
  { key: 'starter', name: 'Starter', monthly_price: 0, project_limit: 1, user_limit: 1, opportunity_limit: 100, scan_limit_monthly: 25, extension_enabled: 0, export_enabled: 1 },
  { key: 'pro', name: 'Pro', monthly_price: 2900, project_limit: 5, user_limit: 5, opportunity_limit: 5000, scan_limit_monthly: 1000, extension_enabled: 1, export_enabled: 1 },
  { key: 'agency', name: 'Agency', monthly_price: 7900, project_limit: 25, user_limit: 15, opportunity_limit: 25000, scan_limit_monthly: 5000, extension_enabled: 1, export_enabled: 1 },
  { key: 'enterprise', name: 'Enterprise', monthly_price: null, project_limit: null, user_limit: null, opportunity_limit: null, scan_limit_monthly: null, extension_enabled: 1, export_enabled: 1 },
];

export function seedPlans() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO plans (key, name, monthly_price, project_limit, user_limit, opportunity_limit, scan_limit_monthly, extension_enabled, export_enabled)
    VALUES (@key, @name, @monthly_price, @project_limit, @user_limit, @opportunity_limit, @scan_limit_monthly, @extension_enabled, @export_enabled)
  `);
  for (const p of PLANS) insert.run(p);
}

export function listPlans() {
  return db.prepare('SELECT * FROM plans ORDER BY monthly_price ASC NULLS LAST').all();
}

export function getPlan(key) {
  return db.prepare('SELECT * FROM plans WHERE key = ?').get(key);
}

export function getWorkspacePlan(workspaceId) {
  const ws = db.prepare('SELECT plan_key FROM workspaces WHERE id = ?').get(workspaceId);
  return ws ? getPlan(ws.plan_key) : null;
}

function withinLimit(current, limit) {
  if (limit === null || limit === undefined) return true;
  return current < limit;
}

export function countWorkspaceProjects(workspaceId) {
  return db.prepare('SELECT COUNT(*) AS c FROM projects WHERE workspace_id = ?').get(workspaceId).c;
}

export function countWorkspaceMembers(workspaceId) {
  return db.prepare("SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ? AND status = 'active'").get(workspaceId).c;
}

export function countWorkspaceOpportunities(workspaceId) {
  return db.prepare(`
    SELECT COUNT(*) AS c FROM opportunities o
    JOIN projects p ON p.id = o.project_id
    WHERE p.workspace_id = ?
  `).get(workspaceId).c;
}

export function getCurrentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getScansUsed(workspaceId, period = getCurrentPeriod()) {
  const row = db.prepare('SELECT scans_used FROM usage_counters WHERE workspace_id = ? AND period = ?').get(workspaceId, period);
  return row?.scans_used ?? 0;
}

export function incrementScansUsed(workspaceId, count = 1) {
  const period = getCurrentPeriod();
  db.prepare(`
    INSERT INTO usage_counters (workspace_id, period, scans_used, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(workspace_id, period) DO UPDATE SET
      scans_used = scans_used + excluded.scans_used,
      updated_at = datetime('now')
  `).run(workspaceId, period, count);
}

export function getWorkspaceUsage(workspaceId) {
  const plan = getWorkspacePlan(workspaceId);
  const period = getCurrentPeriod();
  return {
    plan: plan?.key ?? 'starter',
    plan_name: plan?.name ?? 'Starter',
    projects: { used: countWorkspaceProjects(workspaceId), limit: plan?.project_limit ?? 1 },
    users: { used: countWorkspaceMembers(workspaceId), limit: plan?.user_limit ?? 1 },
    opportunities: { used: countWorkspaceOpportunities(workspaceId), limit: plan?.opportunity_limit ?? 100 },
    scans: { used: getScansUsed(workspaceId, period), limit: plan?.scan_limit_monthly ?? 25, period },
    extension_enabled: !!plan?.extension_enabled,
    export_enabled: plan?.export_enabled !== 0,
  };
}

export function checkPlanLimit(workspaceId, type, extra = 0) {
  const plan = getWorkspacePlan(workspaceId);
  if (!plan) return { ok: false, message: 'Workspace plan not found.' };

  const checks = {
    project: [countWorkspaceProjects(workspaceId), plan.project_limit, extra || 1],
    user: [countWorkspaceMembers(workspaceId), plan.user_limit, extra || 1],
    opportunity: [countWorkspaceOpportunities(workspaceId), plan.opportunity_limit, extra || 1],
    scan: [getScansUsed(workspaceId), plan.scan_limit_monthly, extra || 1],
  };

  const [used, limit, add] = checks[type] ?? [0, null, 0];
  if (!withinLimit(used + add - 1, limit)) {
    return {
      ok: false,
      message: 'You have reached your current plan limit. Please upgrade your plan to continue.',
    };
  }
  return { ok: true };
}

export { PLANS };
