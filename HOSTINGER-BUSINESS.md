# Deploy on Hostinger Business Web Hosting

Use this guide for **Business Web Hosting** (hPanel) — **not VPS**.

Live URL: **https://azbuilds.xyz**

Hostinger Business supports up to **5 Node.js web apps**. SSL and reverse proxy are managed for you.

---

## Before you start

- Business Web Hosting plan active
- Domain **azbuilds.xyz** on the same account
- If `azbuilds.xyz` already has a PHP/WordPress site, back it up first — you may need to **remove that website** in hPanel before adding a Node.js app on the same domain

---

## Option A — Deploy from GitHub (recommended)

### 1. Push code to GitHub

```powershell
cd "c:\Users\AXION USER\Videos\Cursor\backlink-outreach-tool"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/backlink-outreach-tool.git
git push -u origin main
```

### 2. Create Node.js app in hPanel

1. Log in to **hPanel**
2. **Websites** → **Add Website**
3. Choose **Node.js Web App**
4. **Import Git Repository** → authorize GitHub → select `backlink-outreach-tool`

### 3. Build settings

| Setting | Value |
|---------|--------|
| Framework | **Express.js** |
| Node.js version | **20** |
| Entry file | `src/server.js` |
| Package manager | **npm** |
| Build command | `npm install` |
| Start command | `npm start` |

### 4. Environment variables

In hPanel → your app → **Environment Variables**, add:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `DATA_DIR` | `./data` |

Do **not** put API keys in the repo. Add secrets only in hPanel env vars if needed later.

### 5. Deploy

Click **Deploy**. Wait for “Deployment completed”.

Open the temporary Hostinger URL to test, then connect **azbuilds.xyz**:

1. App dashboard → **Domains**
2. Add **azbuilds.xyz** and **www.azbuilds.xyz**
3. SSL enables automatically

---

## Option B — Upload ZIP (no GitHub)

### 1. Create ZIP on your PC

Zip the project folder **without** `node_modules`, `.git`, or `data/*.db`:

- Include: `src/`, `public/`, `package.json`, `package-lock.json`

### 2. Upload in hPanel

1. **Websites** → **Add Website** → **Node.js Web App**
2. **Upload your website files** → select the `.zip`
3. Use the same build settings as Option A
4. Click **Deploy**

---

## hPanel settings cheat sheet

```
Framework:     Express.js
Node version:  20
Entry file:    src/server.js
Build:         npm install
Start:         npm start

Env:
  NODE_ENV=production
  DATA_DIR=./data
```

Health check after deploy: **https://azbuilds.xyz/api/health**

---

## Browser extension

Already configured for **https://azbuilds.xyz**.

After deploy, reload the extension in Chrome. Use **Toggle local / live server** in the popup for local testing.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails on `better-sqlite3` | Set Node.js **20**, redeploy. Check build logs in hPanel. |
| Blank page | Confirm start command is `npm start` and entry is `src/server.js` |
| Data lost after redeploy | Set `DATA_DIR=./data` in env vars; avoid deleting app in hPanel |
| Domain shows old site | Remove old website first, then attach domain to Node.js app |
| 502 error | Open **Runtime logs** in hPanel; check PORT is not hardcoded (app uses `process.env.PORT`) |

---

## VPS / Docker (optional)

If you later move to a VPS, see `docker-compose.yml` and the VPS section in `HOSTINGER.md`.

Business hosting is simpler — **no Docker, no Nginx, no SSH required**.
