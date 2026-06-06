# Deploy Backlink Outreach Tool

## Option 1: Render (recommended)

1. Push this folder to a **GitHub** repo.
2. Go to [render.com](https://render.com) → **New** → **Blueprint**.
3. Connect the repo — Render reads `render.yaml` automatically.
4. Deploy. You get a URL like `https://backlink-outreach-tool.onrender.com`.
5. Open that URL — your dashboard is live.

**Note:** The `starter` plan + disk in `render.yaml` keeps your SQLite data between restarts.

---

## Option 2: Any server with Docker

```bash
docker build -t backlink-outreach .
docker run -d -p 3847:3847 -v outreach-data:/app/data --name outreach backlink-outreach
```

Open `http://YOUR-SERVER-IP:3847`

---

## Option 3: Run locally (already working)

```bash
npm install
npm start
```

Open http://localhost:3847

---

## Browser extension after deploy

1. Open `extension/popup.js` and change the API line:

```javascript
const API = 'https://YOUR-DEPLOYED-URL.onrender.com';
```

2. In `extension/manifest.json`, add your URL to `host_permissions`:

```json
"host_permissions": [
  "http://localhost:3847/*",
  "https://YOUR-DEPLOYED-URL.onrender.com/*"
]
```

3. Reload the extension in Chrome → **Extensions** → refresh icon.

---

## Push to GitHub (first time)

```powershell
cd "c:\Users\AXION USER\Videos\Cursor\backlink-outreach-tool"
git init
git add .
git commit -m "Initial release of backlink outreach tool"
```

Create a repo on GitHub, then:

```powershell
git remote add origin https://github.com/YOUR-USERNAME/backlink-outreach-tool.git
git branch -M main
git push -u origin main
```

Then connect that repo on Render.
