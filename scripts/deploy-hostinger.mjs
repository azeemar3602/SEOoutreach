import axios from 'axios';
import tus from 'tus-js-client';
import { createReadStream, readFileSync, existsSync, statSync, unlinkSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API_BASE = 'https://developers.hostinger.com';
const DOMAIN = process.env.DOMAIN ?? 'azbuilds.xyz';

loadEnv(join(ROOT, '.env'));
const token = process.env.HOSTINGER_API_KEY;
if (!token) {
  console.error('Missing HOSTINGER_API_KEY in .env');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function api(method, path, data) {
  const res = await axios({
    method,
    url: `${API_BASE}${path}`,
    headers: { ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    data,
    timeout: 120000,
    validateStatus: (s) => s < 500,
  });
  if (res.status >= 400) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function resolveUsername(domain) {
  const res = await api('GET', `/api/hosting/v1/websites?domain=${encodeURIComponent(domain)}`);
  const sites = res.data ?? res;
  if (!sites?.length) throw new Error(`No website for ${domain}`);
  return sites[0].username;
}

function createDeployZip() {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const zipName = `SEOoutreach_${stamp}.zip`;
  const zipPath = join(ROOT, zipName);

  if (existsSync(zipPath)) unlinkSync(zipPath);
  execSync(
    `powershell -NoProfile -Command "Set-Location '${ROOT.replace(/'/g, "''")}'; Compress-Archive -Path 'src','public','package.json','package-lock.json' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force"`,
    { stdio: 'inherit' }
  );

  if (!existsSync(zipPath)) throw new Error('Failed to create deploy zip');
  console.log(`Created ${zipName} (${statSync(zipPath).size} bytes)`);
  return zipPath;
}

async function fetchUploadCredentials(username, domain) {
  return api('POST', '/api/hosting/v1/files/upload-urls', { username, domain });
}

function uploadFile(filePath, uploadUrl, authToken, authRestToken) {
  return new Promise((resolve, reject) => {
    const name = basename(filePath);
    const stats = statSync(filePath);
    const cleanUrl = uploadUrl.replace(/\/$/, '');
    const uploadUrlWithFile = `${cleanUrl}/${name}?override=true`;
    const reqHeaders = {
      'X-Auth': authToken,
      'X-Auth-Rest': authRestToken,
      'upload-length': String(stats.size),
      'upload-offset': '0',
    };

    axios.post(uploadUrlWithFile, '', { headers: reqHeaders, validateStatus: (s) => s === 201 })
      .then(() => {
        const upload = new tus.Upload(createReadStream(filePath), {
          uploadUrl: uploadUrlWithFile,
          retryDelays: [1000, 2000, 4000],
          uploadDataDuringCreation: false,
          chunkSize: 10485760,
          headers: reqHeaders,
          metadata: { filename: name, filetype: 'application/zip' },
          onError: (err) => reject(err),
          onSuccess: () => resolve({ filename: name }),
        });
        upload.start();
      })
      .catch(reject);
  });
}

async function fetchBuildSettings(username, domain, archivePath) {
  const base = basename(archivePath);
  return api(
    'GET',
    `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds/settings/from-archive?archive_path=${encodeURIComponent(base)}`
  );
}

async function triggerBuild(username, domain, archivePath, buildSettings) {
  const base = basename(archivePath);
  const buildData = {
    ...buildSettings,
    node_version: 20,
    entry_file: 'src/server.js',
    build_script: 'build',
    package_manager: 'npm',
    source_type: 'archive',
    source_options: { archive_path: base },
  };
  return api(
    'POST',
    `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds`,
    buildData
  );
}

async function listDeployments(username, domain) {
  return api('GET', `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds`);
}

async function pollDeployment(username, domain, maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await listDeployments(username, domain);
    const items = res.data ?? res;
    const latest = Array.isArray(items) ? items[0] : items;
    const state = latest?.state ?? latest?.status;
    console.log(`  Build status: ${state ?? 'pending'} (check ${i + 1}/${maxAttempts})`);
    if (state === 'completed' || state === 'running') {
      if (state === 'completed') return latest;
    }
    if (state === 'failed') throw new Error(`Build failed: ${JSON.stringify(latest)}`);
    await sleep(15000);
  }
  throw new Error('Build timed out — check hPanel for status');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`\n=== Deploying to ${DOMAIN} via Hostinger API ===\n`);

  const username = await resolveUsername(DOMAIN);
  console.log(`Username: ${username}`);

  const zipPath = createDeployZip();

  console.log('Fetching upload credentials...');
  const creds = await fetchUploadCredentials(username, DOMAIN);

  console.log('Uploading archive...');
  await uploadFile(zipPath, creds.url, creds.auth_key, creds.rest_auth_key);
  console.log('Upload complete.');

  console.log('Resolving build settings...');
  let settings = await fetchBuildSettings(username, DOMAIN, zipPath);
  console.log('Detected settings:', JSON.stringify(settings, null, 2));

  console.log('Starting build...');
  const build = await triggerBuild(username, DOMAIN, zipPath, settings);
  console.log('Build queued:', JSON.stringify(build));

  console.log('\nWaiting for deployment (this can take 3-10 minutes)...');
  await pollDeployment(username, DOMAIN);

  console.log(`\nDone! Open https://${DOMAIN}`);
  console.log(`Health: https://${DOMAIN}/api/health\n`);
}

main().catch((err) => {
  console.error('\nDeploy failed:', err.message);
  process.exit(1);
});
