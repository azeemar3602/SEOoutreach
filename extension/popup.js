const API = 'http://localhost:3847';
let pageData = null;

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

async function scanCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action: 'scanPage' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve({ url: tab.url, domain: new URL(tab.url).hostname, emails: [], linkType: 'unknown' });
      } else {
        resolve(response);
      }
    });
  });
}

function renderPageInfo(data) {
  const el = document.getElementById('pageInfo');
  const emailHtml = data.emails.length
    ? `<div class="emails">${data.emails.map((e) => `<span class="email-tag" data-email="${e}">${e}</span>`).join('')}</div>`
    : '<span style="color:#8b93a7">No emails found on page</span>';

  el.innerHTML = `
    <div><strong>${data.domain}</strong></div>
    <div style="margin-top:4px;color:#8b93a7;font-size:10px;word-break:break-all">${data.url}</div>
    ${data.isGuestPostPage ? '<div style="color:#3ecf8e;margin-top:4px">Guest post page detected</div>' : ''}
    <div style="margin-top:6px">${emailHtml}</div>
  `;

  document.querySelectorAll('.email-tag').forEach((tag) => {
    tag.addEventListener('click', () => {
      document.getElementById('contactEmail').value = tag.dataset.email;
    });
  });

  if (data.emails[0]) {
    document.getElementById('contactEmail').value = data.emails[0];
  }
  if (data.linkType) {
    document.getElementById('linkType').value = data.linkType;
  }
}

async function loadProjects() {
  const select = document.getElementById('projectSelect');
  try {
    const projects = await api('/api/projects');
    document.getElementById('serverWarn').style.display = 'none';

    if (!projects.length) {
      select.innerHTML = '<option value="">No projects — create one in dashboard</option>';
      return;
    }

    const saved = (await chrome.storage.local.get('lastProjectId')).lastProjectId;
    select.innerHTML = projects.map((p) =>
      `<option value="${p.id}" ${p.id === saved ? 'selected' : ''}>${p.name}</option>`
    ).join('');
  } catch {
    document.getElementById('serverWarn').style.display = 'block';
    select.innerHTML = '<option value="">Server offline</option>';
  }
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const projectId = document.getElementById('projectSelect').value;
  const status = document.getElementById('status');

  if (!projectId) {
    status.className = 'status err';
    status.textContent = 'Select a project first';
    return;
  }

  status.className = 'status';
  status.textContent = 'Saving...';

  try {
    await api(`/api/projects/${projectId}/capture`, {
      method: 'POST',
      body: JSON.stringify({
        source_url: pageData.url,
        contact_email: document.getElementById('contactEmail').value || null,
        contact_page: pageData.url,
        guest_post_url: pageData.isGuestPostPage ? pageData.url : null,
        link_type: document.getElementById('linkType').value,
        notes: document.getElementById('notes').value,
      }),
    });

    await chrome.storage.local.set({ lastProjectId: parseInt(projectId, 10) });
    status.className = 'status ok';
    status.textContent = 'Saved!';
  } catch (err) {
    status.className = 'status err';
    status.textContent = err.message;
  }
});

document.getElementById('openToolBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: `${API}` });
});

(async () => {
  pageData = await scanCurrentTab();
  renderPageInfo(pageData);
  await loadProjects();
})();
