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
 * The custom domain sits behind the zone's bot protection, which 403s plain
 * fetches from CI datacenter IPs. When that happens (and only then), the same
 * checks run against DEPLOY_FALLBACK_URL — the workers.dev URL of the SAME
 * worker, captured from the deploy log in ci.yml — which fronts no zone WAF.
 *
 * Exits non-zero on any mismatch so the CI deploy job fails loudly.
 */
import { execSync } from 'node:child_process';

const BASE = (process.env.DEPLOY_URL ?? 'https://jaffre.marcportal.com').replace(/\/$/, '');
const FALLBACK = process.env.DEPLOY_FALLBACK_URL?.replace(/\/$/, '') ?? null;
const EXPECTED =
  process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

const ATTEMPTS = Number(process.env.VERIFY_ATTEMPTS ?? 12);
const DELAY_MS = Number(process.env.VERIFY_DELAY_MS ?? 10_000);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The edge (not the app) refused us — the worker never answers 403. */
class EdgeBlockedError extends Error {}

async function fetchText(base: string, path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${base}${path}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
  });
  if (res.status === 403 && (res.headers.has('cf-mitigated') || base === BASE)) {
    throw new EdgeBlockedError(`GET ${path} → 403 (edge bot challenge, not the app)`);
  }
  return { status: res.status, body: await res.text() };
}

async function waitForVersion(base: string): Promise<void> {
  let last = '';
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      const { status, body } = await fetchText(base, `/version.json?t=${Date.now()}`);
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
      if (err instanceof EdgeBlockedError) throw err; // retrying won't unblock the edge
      last = String(err);
    }
    if (i < ATTEMPTS) {
      console.log(`  attempt ${i}/${ATTEMPTS}: ${last} — retrying in ${DELAY_MS / 1000}s`);
      await sleep(DELAY_MS);
    }
  }
  throw new Error(`live bundle never matched after ${ATTEMPTS} attempts: ${last}`);
}

async function checkAssets(base: string): Promise<void> {
  const { status, body } = await fetchText(base, `/?t=${Date.now()}`);
  if (status !== 200) throw new Error(`GET / → ${status}`);
  const assets = [
    ...new Set([...body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])),
  ];
  if (assets.length === 0) throw new Error('index.html references no /assets/ bundles');
  for (const path of assets) {
    const res = await fetch(`${base}${path}`, { method: 'HEAD', cache: 'no-store' });
    if (res.status !== 200) throw new Error(`GET ${path} → ${res.status}`);
  }
  console.log(`✔ index.html live and all ${assets.length} referenced bundles serve 200`);
}

async function verifyAgainst(base: string): Promise<void> {
  console.log(`verifying ${base} serves ${EXPECTED.slice(0, 7)} ...`);
  await waitForVersion(base);
  await checkAssets(base);
}

try {
  try {
    await verifyAgainst(BASE);
  } catch (err) {
    if (!(err instanceof EdgeBlockedError) || FALLBACK === null) throw err;
    console.log(`  ${err.message}`);
    console.log(`  custom domain unverifiable from this runner — same worker via workers.dev:`);
    await verifyAgainst(FALLBACK);
  }
  console.log('✔ deploy verified');
} catch (err) {
  console.error(`✘ deploy verification FAILED: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
