import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API_BASE = 'https://developers.hostinger.com';
const DOMAIN = 'azbuilds.xyz';

loadEnvFile(join(ROOT, '.env'));

const token = process.env.HOSTINGER_API_KEY;
if (!token) {
  console.error('Missing HOSTINGER_API_KEY in .env');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, { headers, ...opts });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    throw new Error(`${opts.method ?? 'GET'} ${path} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    const val = trimmed.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  console.log('\n=== Hostinger setup for azbuilds.xyz ===\n');

  const orders = await api('/api/hosting/v1/orders?per_page=50');
  const list = orders.data ?? orders;
  if (!list?.length) {
    console.log('No hosting orders found. Confirm Business plan is active in hPanel.');
    return;
  }

  console.log('Hosting orders:');
  for (const o of list) {
    console.log(`  #${o.id}  ${o.plan?.name ?? o.title ?? 'plan'}  status=${o.status ?? 'active'}`);
  }

  const active = list.find((o) => /business|cloud|hosting/i.test(JSON.stringify(o))) ?? list[0];
  const orderId = active.id;
  console.log(`\nUsing order ID: ${orderId}`);

  let verify;
  try {
    verify = await api('/api/hosting/v1/domains/verify-ownership', {
      method: 'POST',
      body: JSON.stringify({ domain: DOMAIN }),
    });
    console.log(`Domain ${DOMAIN} accessible:`, verify.is_accessible ?? verify);
  } catch (err) {
    console.log('Domain verify:', err.message);
  }

  let websites;
  try {
    websites = await api(`/api/hosting/v1/websites?domain=${DOMAIN}&per_page=50`);
  } catch {
    websites = await api('/api/hosting/v1/websites?per_page=50');
  }

  const siteList = websites.data ?? websites;
  const existing = siteList?.find?.((w) => w.domain === DOMAIN || w.domain?.includes('azbuilds'));

  if (existing) {
    console.log(`\nWebsite already exists for ${DOMAIN}:`, existing.username ?? existing.id ?? existing);
  } else {
    let datacenter = null;
    try {
      const dc = await api(`/api/hosting/v1/datacenters?order_id=${orderId}`);
      const dcs = dc.data ?? dc;
      datacenter = dcs[0]?.code ?? dcs[0]?.datacenter_code;
      if (datacenter) console.log(`Datacenter: ${datacenter}`);
    } catch {
      /* optional */
    }

    const payload = { domain: DOMAIN, order_id: orderId };
    if (datacenter) payload.datacenter_code = datacenter;

    try {
      await api('/api/hosting/v1/websites', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      console.log(`\nCreated website slot for ${DOMAIN}. Wait 2-5 min, then add Node.js app in hPanel.`);
    } catch (err) {
      console.log('\nCreate website:', err.message);
    }
  }

  console.log(`
=== GitHub repo (ready) ===
https://github.com/azeemar3602/SEOoutreach

=== Finish in hPanel (Node.js — API cannot do this step yet) ===
1. Websites → Add Website → Node.js Web App
2. GitHub → azeemar3602/SEOoutreach
3. Express.js · Node 20 · entry src/server.js
4. Build: npm install · Start: npm start
5. Env: NODE_ENV=production  DATA_DIR=./data
6. Deploy → attach ${DOMAIN}

Direct link: https://hpanel.hostinger.com/websites
`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
