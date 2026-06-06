# Hostinger deploy — azbuilds.xyz (root domain)

Live URL: **https://azbuilds.xyz**

## Security first

Rotate your API key if you shared it in chat. hPanel → **API** → delete old key → create new one.

---

## What you need

| Item | Where to find it |
|------|------------------|
| **API key** | hPanel → API |
| **VM ID** | VPS hostname `srv123456.hstgr.cloud` → ID is `123456` |
| **VPS with Docker** | hPanel → VPS → Docker template |

---

## Step 1 — Push to GitHub

```powershell
cd "c:\Users\AXION USER\Videos\Cursor\backlink-outreach-tool"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/backlink-outreach-tool.git
git push -u origin main
```

---

## Step 2 — GitHub secrets

Repo → **Settings** → **Secrets and variables** → **Actions**

| Type | Name | Value |
|------|------|-------|
| Secret | `HOSTINGER_API_KEY` | your new API key |
| Variable | `HOSTINGER_VM_ID` | VPS number (e.g. `123456`) |

Push to `main` → GitHub Action deploys via Docker.

---

## Step 3 — DNS for root domain

hPanel → **Domains** → **azbuilds.xyz** → **DNS**

| Type | Name | Points to |
|------|------|-----------|
| A | `@` | YOUR_VPS_IP |
| A | `www` | YOUR_VPS_IP |

Remove any old A records pointing elsewhere if the domain should only serve this app.

---

## Step 4 — Nginx + HTTPS on VPS

SSH into the VPS as **root**, then:

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

sudo cp /path/to/backlink-outreach-tool/deploy/nginx-azbuilds.conf /etc/nginx/sites-available/azbuilds
# Or paste from deploy/nginx-azbuilds.conf in this repo

sudo ln -sf /etc/nginx/sites-available/azbuilds /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d azbuilds.xyz -d www.azbuilds.xyz
```

Open **https://azbuilds.xyz**

---

## Step 5 — Browser extension

The extension defaults to `https://azbuilds.xyz`. For local dev, open extension popup → it uses production URL when deployed.

Reload extension in Chrome after deploy.

---

## Manual deploy (no GitHub)

On the VPS:

```bash
git clone https://github.com/YOUR-USERNAME/backlink-outreach-tool.git
cd backlink-outreach-tool
docker compose up -d --build
```

App listens on port **3847**; Nginx proxies **azbuilds.xyz** → `127.0.0.1:3847`.

---

## Checklist

- [ ] API key rotated
- [ ] VPS running with Docker
- [ ] VM ID in GitHub variables
- [ ] Code on GitHub, secrets set
- [ ] A records: `@` and `www` → VPS IP
- [ ] Nginx + SSL on VPS
- [ ] https://azbuilds.xyz loads the dashboard

When VPS + VM ID are ready, share the **VM ID** (number only) and GitHub repo URL if you want help verifying the deploy.
