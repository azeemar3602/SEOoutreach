async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Authentication required');
  }
  if (!res.ok) {
    const msg = data.error || (data.errors && Object.values(data.errors).join(' ')) || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function requireAuth(redirectSuperAdmin = false) {
  try {
    const me = await api('/api/auth/me');
    if (redirectSuperAdmin && me.auth?.isSuperAdmin) {
      window.location.href = '/admin';
      return null;
    }
    return me;
  } catch {
    window.location.href = '/login';
    return null;
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

function formatLimit(used, limit) {
  if (limit == null) return `${used} / unlimited`;
  return `${used} / ${limit}`;
}
