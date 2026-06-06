# Hostinger deploy — azbuilds.xyz

## Security first

You shared your API key in chat. **Rotate it now:**

1. hPanel → **Profile** → **API**
2. Delete the old key
3. Generate a new one
4. Use the new key only in `.env` or GitHub Secrets — never in chat or code

---

## What you need

| Item | Where to find it |
|------|------------------|
| **API key** | hPanel → API |
| **VM ID** | VPS hostname `srv123456.hstgr.cloud` → ID is `123456` |
| **VPS with Docker** | hPanel → VPS → use Docker template |

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

**Secret:**
- `HOSTINGER_API_KEY` = your new API key

**Variable:**
- `HOSTINGER_VM_ID` = your VPS number (e.g. `123456`)

Push to `main` → GitHub Action deploys automatically.

---

## Step 3 — Point azbuilds.xyz to the app

### Option A: Subdomain (recommended)

Use **`outreach.azbuilds.xyz`** for the tool.

In hPanel → **Domains** → **azbuilds.xyz** → **DNS**:

| Type | Name | Points to |
|------|------|-----------|
| A | outreach | YOUR_VPS_IP |

### Option B: Path on main domain

Use Nginx on the VPS to proxy `azbuilds.xyz/outreach` → port 3847 (see below).

---

## Step 4 — Nginx + HTTPS (after deploy)

SSH into your VPS, then:

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/outreach <<'EOF'
server {
    listen 80;
    server_name outreach.azbuilds.xyz;

    location / {
        proxy_pass http://127.0.0.1:3847;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/outreach /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d outreach.azbuilds.xyz
```

Live URL: **https://outreach.azbuilds.xyz**

---

## Step 5 — Update browser extension

In `extension/popup.js`:

```javascript
const API = 'https://outreach.azbuilds.xyz';
```

In `extension/manifest.json`, add to `host_permissions`:

```json
"https://outreach.azbuilds.xyz/*"
```

Reload the extension in Chrome.

---

## Manual deploy (without GitHub)

On the VPS with Docker:

```bash
git clone https://github.com/YOUR-USERNAME/backlink-outreach-tool.git
cd backlink-outreach-tool
docker compose up -d --build
```

App runs on port **3847**.

---

## Checklist

- [ ] API key rotated
- [ ] VPS running with Docker
- [ ] VM ID noted
- [ ] Code pushed to GitHub
- [ ] GitHub secrets set
- [ ] DNS A record for `outreach.azbuilds.xyz`
- [ ] Nginx + SSL configured
- [ ] Extension updated with live URL

When steps 1–3 are done, tell me your **VM ID** and whether you want **`outreach.azbuilds.xyz`** or the root domain — I can help with the Nginx config and DNS record format.
