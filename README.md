# Backlink Outreach Tool

Live site: **https://azbuilds.xyz** · Repo: [github.com/azeemar3602/SEOoutreach](https://github.com/azeemar3602/SEOoutreach)

Multi-site backlink opportunity manager with **guest post contact discovery**. Import competitor backlinks, scan sites for emails and write-for-us pages, track outreach — works across unlimited sites.

> This tool helps you **find contacts and manage outreach**. It does not auto-post links or spam sites.

## Deploy on Hostinger (Business)

1. hPanel → **Websites** → **Add Website** → **Node.js Web App**
2. Connect GitHub repo **`azeemar3602/SEOoutreach`**
3. Settings: Express.js · Node **20** · entry `src/server.js` · build `npm install` · start `npm start`
4. Env: `NODE_ENV=production` and `DATA_DIR=./data`
5. Deploy → attach **azbuilds.xyz**

Full guide: [HOSTINGER-BUSINESS.md](./HOSTINGER-BUSINESS.md)

## Quick start

```bash
cd backlink-outreach-tool
npm install
npm start
```

Open **http://localhost:3847**

## Workflow

1. **Create a project** for each of your sites (Axion, Jersey Shop, etc.)
2. **Import competitor backlinks** — paste Ahrefs/SEMrush CSV or plain URL list
3. **Scan for contacts** — checks `/contact`, `/write-for-us`, `/guest-post`, `/about`, etc.
4. **Filter guest posts** — use type filter to see guest post opportunities with emails
5. **Track outreach** — mark as contacted → replied → published
6. **Export CSV** — for mail merge or spreadsheet follow-up

## CLI commands

```bash
# Create project
node src/cli.js project create "Axion Communications" "https://axioncomms.com"

# List projects
node src/cli.js project list

# Import Ahrefs CSV
node src/cli.js import 1 competitor-backlinks.csv

# Scan for contacts (25 domains at a time)
node src/cli.js scan 1 --limit=50 --type=guest_post

# Export outreach list
node src/cli.js export 1 outreach.csv
```

## Browser extension

Capture opportunities while browsing competitor backlink sites.

1. Start the tool: `npm start`
2. Chrome → **Extensions** → **Manage extensions** → **Load unpacked**
3. Select the `extension` folder
4. Visit a guest post / write-for-us page → click extension icon → **Save opportunity**

The extension reads emails from the current page and saves them to your selected project.

## Supported CSV columns

Auto-detected from Ahrefs, SEMrush, and similar exports:

| Column | Maps to |
|--------|---------|
| Referring page URL | Source URL |
| Target URL | Competitor page linked |
| Domain Rating / DR | Domain authority |
| Anchor text | Link anchor |
| Dofollow / Follow type | Link type |

## Contact discovery

For each domain the scanner checks:

- Homepage
- `/contact`, `/contact-us`
- `/write-for-us`, `/guest-post`, `/contribute`
- `/author-guidelines`, `/pitch-us`
- `/about`, `/about-us`

Emails are prioritized: `editor@`, `content@`, `guest@`, `pitch@`, `media@` rank highest.

## Outreach statuses

| Status | Meaning |
|--------|---------|
| new | Not contacted yet |
| contacted | Pitch sent |
| replied | Site responded |
| published | Guest post live |
| rejected | Declined |

## Tips

- Run scans in batches (25–50) to avoid rate limits
- Re-scan unscanned domains after importing large CSVs
- Use **Quick contact lookup** for one-off domain checks
- Filter **Has email** + **Guest post** before starting outreach

## Data storage

SQLite database: `data/outreach.db` — backup this file to keep all projects.
