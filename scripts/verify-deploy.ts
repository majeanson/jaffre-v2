/**
 * Post-deploy smoke check — proves the LIVE site is serving the commit we just
 * deployed, not merely that CI went green.
 *
 *   npx tsx scripts/verify-deploy.ts                     # expect HEAD live
 *   DEPLOY_URL=https://... npx tsx scripts/verify-deploy.ts
 *
 * Checks, in order:
 *   1. /version.json (stamped by the vite build) reports the expected sha —
 *      polled for up to 2 minutes to ride out edge propagation.
 *   2. / (index.html) references hashed JS bundles and each one serves 200 —
 *      catches the "new html, missing assets" class of broken deploy.
 *
 * Exits non-zero on any mismatch so the CI deploy job fails loudly.
 */
import { execSync } from 'node:child_process';

const BASE = (process.env.DEPLOY_URL ?? 'https://jaffre.marcportal.com').replace(/\/$/, '');
const EXPECTED =
  process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

const ATTEMPTS = Number(process.env.VERIFY_ATTEMPTS ?? 12);
const DELAY_MS = Number(process.env.VERIFY_DELAY_MS ?? 10_000);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function fetchText(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
  });
  return { status: res.status, body: await res.text() };
}

async function waitForVersion(): Promise<void> {
  let last = '';
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      const { status, body } = await fetchText(`/version.json?t=${Date.now()}`);
      if (status === 200 && body.trimStart().startsWith('<')) {
        // The SPA fallback answers 200 with index.html for missing files.
        last = 'version.json not deployed yet (SPA fallback served)';
      } else if (status === 200) {
        const sha = (JSON.parse(body) as { sha?: string }).sha ?? '';
        if (sha === EXPECTED) {
          console.log(`✔ live version.json matches deployed commit ${EXPECTED.slice(0, 7)}`);
          return;
        }
        last = `live sha ${sha.slice(0, 7) || '(none)'} != expected ${EXPECTED.slice(0, 7)}`;
      } else {
        last = `GET /version.json → ${status}`;
      }
    } catch (err) {
      last = String(err);
    }
    if (i < ATTEMPTS) {
      console.log(`  attempt ${i}/${ATTEMPTS}: ${last} — retrying in ${DELAY_MS / 1000}s`);
      await sleep(DELAY_MS);
    }
  }
  throw new Error(`live bundle never matched after ${ATTEMPTS} attempts: ${last}`);
}

async function checkAssets(): Promise<void> {
  const { status, body } = await fetchText(`/?t=${Date.now()}`);
  if (status !== 200) throw new Error(`GET / → ${status}`);
  const assets = [
    ...new Set([...body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])),
  ];
  if (assets.length === 0) throw new Error('index.html references no /assets/ bundles');
  for (const path of assets) {
    const res = await fetch(`${BASE}${path}`, { method: 'HEAD', cache: 'no-store' });
    if (res.status !== 200) throw new Error(`GET ${path} → ${res.status}`);
  }
  console.log(`✔ index.html live and all ${assets.length} referenced bundles serve 200`);
}

try {
  console.log(`verifying ${BASE} serves ${EXPECTED.slice(0, 7)} ...`);
  await waitForVersion();
  await checkAssets();
  console.log('✔ deploy verified');
} catch (err) {
  console.error(`✘ deploy verification FAILED: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
