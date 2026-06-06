# Hostinger deployment

## Business Web Hosting (your plan) — use this

**→ [HOSTINGER-BUSINESS.md](./HOSTINGER-BUSINESS.md)**

Deploy via hPanel → **Websites** → **Node.js Web App** → GitHub or ZIP.

Domain: **https://azbuilds.xyz**

---

## VPS + Docker (alternative)

Only if you have a separate VPS plan with Docker.

### GitHub Action deploy

Secrets: `HOSTINGER_API_KEY`  
Variables: `HOSTINGER_VM_ID`

Uses `.github/workflows/deploy-hostinger.yml` + `docker-compose.yml`.

### Manual VPS + Nginx

See `deploy/nginx-azbuilds.conf` for root domain proxy to port 3847.
