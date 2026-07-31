/**
 * One-off: renders the link-preview card to apps/web/public/social/og.png
 * (1200×630 — the Open Graph large-card size every scraper crops from).
 *
 * The PNG is CHECKED IN; re-run this by hand only when the art changes:
 *   node scripts/make-og-image.mjs
 *
 * Why a screenshot instead of hand-drawn art: the card reuses the app's real
 * display face (Silkscreen, the same @fontsource woff2 the bundle ships) and
 * the favicon's two-tilted-cards motif, so the preview in Messenger/Slack
 * looks like the app that opens. Kept in scripts/ beside verify-deploy.ts;
 * Playwright's chromium is already a workspace devDependency.
 *
 * House law: the violet panel colour is never paired with white text — the
 * card sticks to the arcade ground/ivory/gold/ink palette outright.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'apps/web/public/social/og.png');
// Base64 data URIs, not file: URLs — the page is setContent() over
// about:blank, which quietly refuses file: subresources and falls back to
// system fonts (the first render of this card shipped Segoe, not Silkscreen).
const fontData = (path) =>
  `data:font/woff2;base64,${readFileSync(resolve(root, path)).toString('base64')}`;
const silkscreen = fontData(
  'node_modules/@fontsource/silkscreen/files/silkscreen-latin-700-normal.woff2',
);
// The same variable woff2 the app bundles (see src/fonts/rubik-latin.css).
const rubik = fontData(
  'node_modules/@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2',
);

// Palette: the arcade shell's dark ground + the favicon's card colours
// (ivory / gold / ink / red) — tokens.css values, frozen here on purpose so
// the card doesn't silently drift when a theme experiment touches tokens.
const html = `<!doctype html>
<html>
<head>
<style>
  @font-face {
    font-family: 'Silkscreen';
    src: url('${silkscreen}') format('woff2');
    font-weight: 700;
  }
  @font-face {
    font-family: 'Rubik';
    src: url('${rubik}') format('woff2-variations');
    font-weight: 300 900;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px;
    height: 630px;
    background: #181225;
    overflow: hidden;
    display: flex;
    align-items: center;
    font-family: 'Rubik', sans-serif;
  }
  /* A quiet violet glow behind the cards — background only, no text on it. */
  .glow {
    position: absolute;
    left: 40px;
    top: 55px;
    width: 520px;
    height: 520px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(124, 92, 219, 0.28) 0%, rgba(124, 92, 219, 0) 68%);
  }
  .cards {
    position: relative;
    width: 460px;
    margin-left: 90px;
    flex-shrink: 0;
  }
  .copy {
    position: relative;
    margin-left: 84px;
    margin-right: 60px;
  }
  h1 {
    font-family: 'Silkscreen', monospace;
    font-weight: 700;
    /* Silkscreen runs wide — 84px keeps all six letters inside the frame
       with air to spare (118px clipped the E). */
    font-size: 84px;
    color: #f2c66d;
    text-shadow: 0 6px 0 rgba(0, 0, 0, 0.45);
  }
  .tag {
    margin-top: 30px;
    font-size: 34px;
    line-height: 1.35;
    color: #f6efdf;
    max-width: 460px;
  }
  .sub {
    margin-top: 22px;
    font-size: 26px;
    color: #9d93b8;
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="cards">
    <!-- The favicon's motif, scaled up: ivory card behind, gold card in
         front, the red pip riding the gold card. -->
    <svg viewBox="0 0 32 32" width="460" height="460" aria-hidden="true">
      <rect x="3" y="2" width="20" height="27" rx="3" fill="#f6efdf" stroke="#2a2320"
            stroke-width="1.5" transform="rotate(-8 13 15)"/>
      <rect x="9" y="3" width="20" height="27" rx="3" fill="#f2c66d" stroke="#2a2320"
            stroke-width="1.5" transform="rotate(6 19 16)"/>
      <circle cx="19.5" cy="17" r="5" fill="#d43a3a"/>
    </svg>
  </div>
  <div class="copy">
    <h1>JAFFRE</h1>
    <p class="tag">Bid. Take the tricks. First team to 41 wins.</p>
    <p class="sub">4 players &middot; free &middot; nothing to install</p>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: 'networkidle' });
// Fonts load from file: URLs — wait for them explicitly, networkidle can win.
await page.evaluate(() => document.fonts.ready);
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
