let activeProjectId = null;

const $ = (sel) => document.querySelector(sel);
const api = (path, opts = {}) =>
  fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts }).then((r) => r.json());

async function loadProjects() {
  const projects = await api('/api/projects');
  const list = $('#projectList');
  list.innerHTML = projects.map((p) => `
    <div class="project-item ${p.id === activeProjectId ? 'active' : ''}" data-id="${p.id}">
      <div class="name">${esc(p.name)}</div>
      <div class="meta">${p.opportunity_count} opportunities</div>
    </div>
  `).join('');

  list.querySelectorAll('.project-item').forEach((el) => {
    el.addEventListener('click', () => selectProject(parseInt(el.dataset.id, 10)));
  });
}

async function selectProject(id) {
  activeProjectId = id;
  const project = (await api('/api/projects')).find((p) => p.id === id);
  if (!project) return;

  $('#emptyState').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
  $('#projectName').textContent = project.name;
  const urlEl = $('#projectUrl');
  urlEl.textContent = project.site_url;
  urlEl.href = project.site_url;

  await loadProjects();
  await refreshDashboard();
}

async function refreshDashboard() {
  if (!activeProjectId) return;

  const stats = await api(`/api/projects/${activeProjectId}/stats`);
  $('#stats').innerHTML = [
    ['Total', stats.total],
    ['New', stats.new_count],
    ['With email', stats.with_email],
    ['Guest posts', stats.guest_post],
    ['Contacted', stats.contacted],
    ['Published', stats.published],
  ].map(([label, value]) => `
    <div class="stat-card"><div class="value">${value ?? 0}</div><div class="label">${label}</div></div>
  `).join('');

  const params = new URLSearchParams();
  const type = $('#filterType').value;
  const status = $('#filterStatus').value;
  if (type) params.set('link_type', type);
  if (status) params.set('status', status);
  if ($('#filterHasEmail').checked) params.set('has_contact', '1');

  const opps = await api(`/api/projects/${activeProjectId}/opportunities?${params}`);
  const tbody = $('#oppTable');

  if (!opps.length) {
    const hasFilters = type || status || $('#filterHasEmail').checked;
    let hint = 'No opportunities yet — import competitor backlinks above.';
    if (hasFilters) {
      const all = await api(`/api/projects/${activeProjectId}/opportunities`);
      if (all.length) {
        hint = `${all.length} opportunities hidden by your filters — set Type to "All types" and uncheck "Has email".`;
      }
    }
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:2rem">${hint}</td></tr>`;
    return;
  }

  tbody.innerHTML = opps.map((o) => `
    <tr>
      <td>
        <a href="https://${esc(o.domain)}" target="_blank" rel="noopener">${esc(o.domain)}</a>
      </td>
      <td><span class="badge badge-${o.link_type}">${formatType(o.link_type)}</span></td>
      <td>${o.dr ?? '—'}</td>
      <td>
        ${o.contact_email
          ? `<a class="email-link" href="mailto:${esc(o.contact_email)}">${esc(o.contact_email)}</a>`
          : '<span style="color:var(--muted)">—</span>'}
        ${o.contact_name ? `<br><small style="color:var(--muted)">${esc(o.contact_name)}</small>` : ''}
      </td>
      <td>${o.guest_post_url
        ? `<a href="${esc(o.guest_post_url)}" target="_blank" rel="noopener" style="color:var(--accent);font-size:0.78rem">View</a>`
        : '—'}</td>
      <td><span class="badge badge-${o.status}">${o.status}</span></td>
      <td>${o.score}</td>
      <td class="actions-cell">
        <button class="btn btn-sm btn-ghost edit-btn" data-id="${o.id}">Edit</button>
        <button class="btn btn-sm btn-ghost del-btn" data-id="${o.id}">Del</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => openEdit(parseInt(btn.dataset.id, 10)));
  });
  tbody.querySelectorAll('.del-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this opportunity?')) return;
      await api(`/api/opportunities/${btn.dataset.id}`, { method: 'DELETE' });
      refreshDashboard();
    });
  });
}

function formatType(t) {
  return (t ?? 'unknown').replace(/_/g, ' ');
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function openEdit(id) {
  const opps = await api(`/api/projects/${activeProjectId}/opportunities`);
  const o = opps.find((x) => x.id === id);
  if (!o) return;

  const form = $('#editForm');
  form.id.value = o.id;
  form.status.value = o.status;
  form.contact_email.value = o.contact_email ?? '';
  form.contact_name.value = o.contact_name ?? '';
  form.guest_post_url.value = o.guest_post_url ?? '';
  form.contact_page.value = o.contact_page ?? '';
  form.notes.value = o.notes ?? '';
  $('#editDialog').showModal();
}

$('#newProjectBtn').addEventListener('click', () => $('#projectDialog').showModal());
$('#cancelProject').addEventListener('click', () => $('#projectDialog').close());
$('#cancelEdit').addEventListener('click', () => $('#editDialog').close());

$('#projectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const project = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify(Object.fromEntries(fd)),
  });
  $('#projectDialog').close();
  e.target.reset();
  await loadProjects();
  selectProject(project.id);
});

$('#editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);
  const id = data.id;
  delete data.id;
  await api(`/api/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  $('#editDialog').close();
  refreshDashboard();
});

$('#importCsvBtn').addEventListener('click', async () => {
  const csv = $('#importText').value.trim();
  if (!csv) return alert('Paste CSV content first');
  const result = await api(`/api/projects/${activeProjectId}/import-csv`, {
    method: 'POST',
    body: JSON.stringify({ csv }),
  });
  alert(`Imported ${result.imported} opportunities (${result.skipped} skipped)`);
  $('#importText').value = '';
  refreshDashboard();
});

$('#importUrlsBtn').addEventListener('click', async () => {
  const text = $('#importText').value.trim();
  if (!text) return alert('Paste URLs first');
  const urls = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const result = await api(`/api/projects/${activeProjectId}/import-urls`, {
    method: 'POST',
    body: JSON.stringify({ urls }),
  });
  alert(`Imported ${result.imported} URLs (${result.skipped} skipped)`);
  $('#importText').value = '';
  refreshDashboard();
});

$('#scanBtn').addEventListener('click', async () => {
  const statusEl = $('#scanStatus');
  statusEl.classList.remove('hidden');
  statusEl.textContent = 'Starting contact scan (checks contact, about, write-for-us pages)...';

  const { jobId } = await api(`/api/projects/${activeProjectId}/scan`, {
    method: 'POST',
    body: JSON.stringify({ limit: 25 }),
  });

  const poll = setInterval(async () => {
    const job = await api(`/api/scan/${jobId}`);
    if (job.status === 'running' && job.progress) {
      statusEl.textContent = `Scanning [${job.progress.current}/${job.progress.total}]: ${job.progress.domain}`;
    }
    if (job.status === 'done') {
      clearInterval(poll);
      statusEl.textContent = `Done — scanned ${job.result.scanned}, found ${job.result.found_email} emails, ${job.result.found_guest} guest post pages.`;
      refreshDashboard();
      setTimeout(() => statusEl.classList.add('hidden'), 8000);
    }
    if (job.status === 'error') {
      clearInterval(poll);
      statusEl.textContent = `Error: ${job.error}`;
    }
  }, 1500);
});

$('#lookupBtn').addEventListener('click', async () => {
  const domain = $('#lookupDomain').value.trim();
  if (!domain) return;
  const resultEl = $('#lookupResult');
  resultEl.classList.remove('hidden');
  resultEl.textContent = 'Searching...';

  const result = await api('/api/find-contacts', {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });

  resultEl.textContent = [
    `Primary email: ${result.contact_email ?? 'none found'}`,
    `All emails: ${result.emails?.join(', ') || 'none'}`,
    `Guest post page: ${result.guest_post_url ?? 'none'}`,
    `Contact page: ${result.contact_page ?? 'none'}`,
    `Contact name: ${result.contact_name ?? 'none'}`,
  ].join('\n');
});

$('#exportBtn').addEventListener('click', () => {
  window.location.href = `/api/projects/${activeProjectId}/export`;
});

$('#refreshBtn').addEventListener('click', refreshDashboard);
$('#filterType').addEventListener('change', refreshDashboard);
$('#filterStatus').addEventListener('change', refreshDashboard);
$('#filterHasEmail').addEventListener('change', refreshDashboard);

loadProjects();
