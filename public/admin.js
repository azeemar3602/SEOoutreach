async function initAdmin() {
  const me = await api('/api/auth/me');
  if (!me.auth?.isSuperAdmin) {
    window.location.href = '/dashboard';
    return;
  }

  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      ['overview', 'workspaces', 'users', 'audit'].forEach((name) => {
        document.getElementById(`tab-${name}`).classList.toggle('hidden', tab.dataset.tab !== name);
      });
    });
  });

  const stats = await api('/api/admin/stats');
  document.getElementById('adminStats').innerHTML = Object.entries(stats).map(([k, v]) => `
    <div class="stat-card"><div class="value">${v}</div><div class="label">${k.replace(/_/g, ' ')}</div></div>
  `).join('');

  const workspaces = await api('/api/admin/workspaces');
  document.getElementById('wsTable').innerHTML = workspaces.map((w) => `
    <tr>
      <td>${esc(w.name)}</td>
      <td>
        <select data-ws="${w.id}" class="plan-select">
          ${['starter','pro','agency','enterprise'].map((p) => `<option value="${p}" ${w.plan_key===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </td>
      <td>
        <select data-ws-status="${w.id}">
          ${['active','suspended'].map((s) => `<option value="${s}" ${w.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>${w.member_count}</td>
      <td>${w.project_count}</td>
      <td></td>
    </tr>`).join('');

  document.querySelectorAll('.plan-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await api(`/api/admin/workspaces/${sel.dataset.ws}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({ plan_key: sel.value }),
      });
    });
  });

  document.querySelectorAll('[data-ws-status]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await api(`/api/admin/workspaces/${sel.dataset.wsStatus}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: sel.value }),
      });
    });
  });

  const users = await api('/api/admin/users');
  document.getElementById('usersTable').innerHTML = users.map((u) => `
    <tr>
      <td>${esc(u.full_name)}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.status)}</td>
      <td>${esc(u.memberships || '')}</td>
    </tr>`).join('');

  const logs = await api('/api/admin/audit-logs?limit=50');
  document.getElementById('auditTable').innerHTML = logs.map((l) => `
    <tr>
      <td>${esc(l.created_at)}</td>
      <td>${esc(l.action)}</td>
      <td>${l.user_id ?? '—'}</td>
      <td>${l.workspace_id ?? '—'}</td>
    </tr>`).join('');
}

initAdmin();
