#!/usr/bin/env node
import { importCsv, importUrlList } from './import.js';
import { scanProject } from './scanner.js';
import { listProjects, createProject, listOpportunities } from './db.js';
import db from './db.js';
import { writeFileSync } from 'fs';
import { runMigrations } from './migrate.js';
import { createSuperAdminUser } from './auth-store.js';

runMigrations();

const [, , cmd, ...args] = process.argv;

function usage() {
  console.log(`
Backlink Outreach Tool — CLI

  node src/cli.js project create "Site Name" "https://yoursite.com"
  node src/cli.js project list
  node src/cli.js import <projectId> <file.csv>
  node src/cli.js import-urls <projectId> urls.txt
  node src/cli.js scan <projectId> [--limit=50] [--type=guest_post]
  node src/cli.js export <projectId> output.csv
  node src/cli.js admin create "Admin Name" "admin@example.com" "StrongPassword123"

  npm start   — open web dashboard at http://localhost:3847
`);
}

async function main() {
  if (!cmd || cmd === 'help') {
    usage();
    return;
  }

  if (cmd === 'admin') {
    const sub = args[0];
    if (sub === 'create') {
      const [, name, email, password] = args;
      if (!name || !email || !password) {
        console.error('Usage: node src/cli.js admin create "Name" "email" "password"');
        process.exit(1);
      }
      const user = createSuperAdminUser({ full_name: name, email, password });
      console.log(`Super Admin created: ${user.email} (id ${user.id})`);
    } else {
      usage();
    }
    return;
  }

  if (cmd === 'project') {
    const sub = args[0];
    if (sub === 'create') {
      const ws = db.prepare('SELECT id FROM workspaces ORDER BY id ASC LIMIT 1').get();
      const p = createProject({ workspace_id: ws.id, name: args[1], site_url: args[2] });
      console.log(`Created project #${p.id}: ${p.name}`);
    } else if (sub === 'list') {
      const projects = listProjects(null, true);
      projects.forEach((p) => {
        console.log(`#${p.id}  ${p.name}  (${p.site_url})  — ${p.opportunity_count} opportunities`);
      });
    }
    return;
  }

  if (cmd === 'import') {
    const projectId = parseInt(args[0], 10);
    const file = args[1];
    const result = importCsv(file, projectId);
    console.log(`Imported: ${result.imported}, skipped: ${result.skipped}`);
    if (result.errors.length) console.log('Errors:', result.errors.slice(0, 5));
    return;
  }

  if (cmd === 'import-urls') {
    const projectId = parseInt(args[0], 10);
    const { readFileSync } = await import('fs');
    const urls = readFileSync(args[1], 'utf-8').split('\n');
    const result = importUrlList(urls, projectId);
    console.log(`Imported: ${result.imported}, skipped: ${result.skipped}`);
    return;
  }

  if (cmd === 'scan') {
    const projectId = parseInt(args[0], 10);
    const limitArg = args.find((a) => a.startsWith('--limit='));
    const typeArg = args.find((a) => a.startsWith('--type='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50;
    const linkType = typeArg ? typeArg.split('=')[1] : null;

    console.log(`Scanning up to ${limit} domains for contacts...`);
    const result = await scanProject(projectId, {
      limit,
      linkType,
      onProgress: ({ current, total, domain }) => {
        process.stdout.write(`\r[${current}/${total}] ${domain}                    `);
      },
    });
    console.log(`\nScanned: ${result.scanned}, emails found: ${result.found_email}, guest pages: ${result.found_guest}`);
    return;
  }

  if (cmd === 'export') {
    const projectId = parseInt(args[0], 10);
    const outFile = args[1] ?? 'export.csv';
    const opps = listOpportunities(projectId);
    const headers = [
      'domain', 'source_url', 'link_type', 'dr', 'contact_email',
      'contact_name', 'guest_post_url', 'contact_page', 'status', 'score', 'notes',
    ];
    const lines = [headers.join(',')];
    for (const o of opps) {
      lines.push(headers.map((h) => `"${(o[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
    }
    writeFileSync(outFile, lines.join('\n'));
    console.log(`Exported ${opps.length} rows to ${outFile}`);
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
