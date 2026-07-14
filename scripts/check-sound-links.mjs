#!/usr/bin/env node
/**
 * Verifies every URL in src/data/soundSources.json is actually reachable.
 * Run manually with `npm run check:sounds`, or wire into CI/prebuild so a rotated or
 * removed Mixkit asset gets caught before a user hits silence in production.
 *
 * Uses GET with a byte-range request (not HEAD) because some CDNs — including Mixkit's —
 * respond differently to HEAD than to the real request a browser's <audio> tag will make.
 * Range: bytes=0-0 keeps the download to a single byte either way.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'src', 'data', 'soundSources.json');
const { sounds } = JSON.parse(readFileSync(dataPath, 'utf-8'));

const TIMEOUT_MS = 10_000;

async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0', 'User-Agent': 'Mozilla/5.0 (compatible; sound-link-check)' },
      signal: controller.signal,
    });
    // 206 = partial content (expected for a range request), 200 = server ignored the range
    // and sent the whole file anyway — both mean the resource is alive.
    return { ok: res.status === 200 || res.status === 206, status: res.status };
  } catch (err) {
    return { ok: false, status: err.name === 'AbortError' ? 'TIMEOUT' : `ERROR: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

const results = await Promise.all(
  sounds.map(async ({ id, url }) => ({ id, url, ...(await checkUrl(url)) }))
);

let hadFailure = false;
for (const r of results) {
  const line = `${r.ok ? 'OK  ' : 'FAIL'}  ${String(r.status).padEnd(9)} ${r.id.padEnd(10)} ${r.url}`;
  console.log(line);
  if (!r.ok) hadFailure = true;
}

if (hadFailure) {
  console.error('\nOne or more sound links are unreachable. Update src/data/soundSources.json before releasing.');
  process.exit(1);
} else {
  console.log(`\nAll ${results.length} sound links OK.`);
}
