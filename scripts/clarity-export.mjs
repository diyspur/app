#!/usr/bin/env node

/**
 * Microsoft Clarity Data Export Script
 *
 * Utilizes the Clarity Data Export API (project-live-insights) with the JWT export token
 * to fetch live insights for integration with observability pipelines (e.g. Grafana Loki).
 *
 * Usage:
 *   node scripts/clarity-export.mjs [--numOfDays=1] [--out=output.json]
 *   or with direct environment variable:
 *   CLARITY_DATA_EXPORT_TOKEN="<token>" node scripts/clarity-export.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Helper to load simple .env / .env.local file if present and token not already in env
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore error loading env file
  }
}

// Attempt to load .env.local or .env from current directory or app root
loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));

function parseArgs(args) {
  const options = {
    numOfDays: 1,
    out: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--numOfDays=')) {
      options.numOfDays = parseInt(arg.split('=')[1], 10) || 1;
    } else if (arg === '--numOfDays' && args[i + 1]) {
      options.numOfDays = parseInt(args[++i], 10) || 1;
    } else if (arg.startsWith('--out=')) {
      options.out = arg.split('=')[1];
    } else if (arg === '--out' && args[i + 1]) {
      options.out = args[++i];
    }
  }

  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    console.log(`
Microsoft Clarity Data Export Tool

Usage:
  node scripts/clarity-export.mjs [options]

Options:
  --numOfDays <1-3>   Number of days of data to export (default: 1)
  --out <filename>    Save output to specified JSON file
  --help, -h          Show this help message

Environment variables required:
  CLARITY_DATA_EXPORT_TOKEN: Bearer JWT token from Microsoft Clarity Settings
`);
    process.exit(0);
  }

  const token = process.env.CLARITY_DATA_EXPORT_TOKEN;
  if (!token) {
    console.error('Error: CLARITY_DATA_EXPORT_TOKEN environment variable is not defined.');
    console.error('Configure it in your .env.local or pass it directly in the command environment.');
    process.exit(1);
  }

  const url = new URL('https://www.clarity.ms/export-data/api/v1/project-live-insights');
  if (options.numOfDays) {
    url.searchParams.set('numOfDays', String(options.numOfDays));
  }

  console.log(`[Clarity Export] Fetching data from ${url.toString()}...`);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[Clarity Export] API error (${response.status} ${response.statusText}):\n${errorBody}`
      );
      process.exit(1);
    }

    const data = await response.json();
    const formatted = JSON.stringify(data, null, 2);

    if (options.out) {
      const targetPath = resolve(process.cwd(), options.out);
      writeFileSync(targetPath, formatted, 'utf-8');
      console.log(`[Clarity Export] Successfully saved data to ${targetPath}`);
    } else {
      console.log('[Clarity Export] Success. Payload summary:');
      console.log(formatted);
    }
  } catch (error) {
    console.error('[Clarity Export] Network or execution error:', error);
    process.exit(1);
  }
}

main();
