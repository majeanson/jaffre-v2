import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * One identity + 3-word recovery (Phase 1, workstream A), against the real
 * server: the home screen mints a guest identity and shows its recovery code
 * once; typing that code into a brand-new browser context restores the SAME
 * uid (so history/stats follow the player across devices). Requires the e2e
 * server's SESSION_SECRET (see playwright.config.ts webServer command).
 */

const CODE_RE = /^[a-z]+-[a-z]+-[a-z]+$/;

/** The canonical uid of the identity this page currently holds. */
async function uidOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('jaffre-token');
    if (raw === null) throw new Error('no jaffre-token in localStorage');
    return (JSON.parse(raw) as { userId: string }).userId;
  });
}

/** The minted 3-word code from this browser's localStorage (null pre-mint).
 * The words are no longer SHOWN — real login is the durable path and the code
 * is a silent fallback — but the mint still issues + stores them. */
function codeOf(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('jaffre-recovery'));
}

test('first visit mints an identity with a recovery code that persists (hidden)', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');

  // The mint lands shortly after load; the code is stored, never displayed.
  await expect.poll(() => codeOf(page)).toMatch(CODE_RE);
  const words = await codeOf(page);

  // The restore affordance is still there, quietly, under Customize.
  await page.getByRole('button', { name: /Customize/ }).click();
  await expect(page.getByRole('button', { name: 'I have a code' })).toBeVisible();

  // Same words after a reload — the code is issued exactly once per browser.
  await page.reload();
  await expect.poll(() => codeOf(page)).toBe(words);

  await context.close();
});

test('a recovery code restores the same identity (uid + name) in a fresh browser', async ({
  browser,
}) => {
  // Browser A: mint an identity under a distinctive name, keep its code.
  const contextA = await browser.newContext();
  const a = await contextA.newPage();
  await a.addInitScript(() => localStorage.setItem('jaffre-name', 'Marc-e2e'));
  await a.goto('/');
  await expect.poll(() => codeOf(a)).toMatch(CODE_RE);
  const words = (await codeOf(a)) ?? '';
  const uidA = await uidOf(a);
  await contextA.close();

  // Browser B: a completely fresh context (its own localStorage) mints its
  // own identity first — entering A's words must replace it with A's.
  const contextB = await browser.newContext();
  const b = await contextB.newPage();
  await b.goto('/');
  await expect.poll(() => codeOf(b)).toMatch(CODE_RE); // B's own mint done
  const uidB = await uidOf(b);
  expect(uidB).not.toBe(uidA);

  await b.getByRole('button', { name: /Customize/ }).click();
  await b.getByRole('button', { name: 'I have a code' }).click();
  await b.getByPlaceholder('lampe-tricot-hibou').fill(words);
  await b.getByRole('button', { name: 'Restore' }).click();

  // recoverIdentity() stores the recovered token, then reloads the page —
  // poll (an evaluate can transiently fail mid-reload) until A's identity is
  // in place: same uid, and A's name restored without retyping it.
  await expect.poll(() => uidOf(b).catch(() => 'evaluating')).toBe(uidA);
  await expect
    .poll(() => b.evaluate(() => localStorage.getItem('jaffre-name')).catch(() => null))
    .toBe('Marc-e2e');

  // The restored identity is what the server sees too (request runs outside
  // the page, so the reload can't race it).
  let token = '';
  await expect
    .poll(() =>
      b
        .evaluate(() => {
          const raw = localStorage.getItem('jaffre-token');
          return raw === null ? null : (JSON.parse(raw) as { token: string }).token;
        })
        .then((t) => {
          token = t ?? '';
          return t;
        })
        .catch(() => null),
    )
    .not.toBeNull();
  const res = await b.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const me = (await res.json()) as { userId: string; name: string };
  expect(me.userId).toBe(uidA);
  expect(me.name).toBe('Marc-e2e');

  await contextB.close();
});

/** The Bearer token this page currently holds, or null. */
async function tokenOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('jaffre-token');
    return raw === null ? null : (JSON.parse(raw) as { token: string }).token;
  });
}

test('a chosen colour persists server-side and follows a recovery into a fresh browser', async ({
  browser,
}) => {
  // Browser A: mint an identity, then pick a palette colour for the card.
  const contextA = await browser.newContext();
  const a = await contextA.newPage();
  await a.addInitScript(() => localStorage.setItem('jaffre-name', 'Colour-e2e'));
  await a.goto('/');
  // The name + palette live in the "Customize" disclosure; the recovery code
  // is minted alongside but stays hidden (login is the durable path now).
  await a.getByRole('button', { name: /Customize/ }).click();
  await expect.poll(() => codeOf(a)).toMatch(CODE_RE); // mint done → token exists
  const wordsA = (await codeOf(a)) ?? '';

  const CHOSEN = '#f2b712';
  await a.getByRole('button', { name: `Colour ${CHOSEN}` }).click();

  const tokenA = await tokenOf(a);
  expect(tokenA).not.toBeNull();
  const uidA = await uidOf(a);
  // The server persisted the colour under A's identity (POST /api/profile).
  await expect
    .poll(async () => {
      const res = await a.request.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${tokenA ?? ''}` },
      });
      return ((await res.json()) as { color: string | null }).color;
    })
    .toBe(CHOSEN);
  await contextA.close();

  // Browser B: a fresh context recovers A's identity — the colour comes along.
  const contextB = await browser.newContext();
  const b = await contextB.newPage();
  await b.goto('/');
  await expect.poll(() => codeOf(b)).toMatch(CODE_RE);
  await b.getByRole('button', { name: /Customize/ }).click();
  await b.getByRole('button', { name: 'I have a code' }).click();
  await b.getByPlaceholder('lampe-tricot-hibou').fill(wordsA);
  await b.getByRole('button', { name: 'Restore' }).click();

  await expect.poll(() => uidOf(b).catch(() => 'evaluating')).toBe(uidA);
  // Locally cached under the recovered identity…
  await expect
    .poll(() =>
      b
        .evaluate(() => {
          const raw = localStorage.getItem('jaffre-profile');
          return raw === null ? null : (JSON.parse(raw) as { color: string | null }).color;
        })
        .catch(() => null),
    )
    .toBe(CHOSEN);
  await contextB.close();
});

test('a wrong code shows the error and keeps the current identity', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect.poll(() => codeOf(page)).toMatch(CODE_RE);
  await page.getByRole('button', { name: /Customize/ }).click();
  const uidBefore = await uidOf(page);

  await page.getByRole('button', { name: 'I have a code' }).click();
  await page.getByPlaceholder('lampe-tricot-hibou').fill('aaaa-bbbb-cccc');
  await page.getByRole('button', { name: 'Restore' }).click();

  await expect(page.getByText("That code didn't match")).toBeVisible();
  expect(await uidOf(page)).toBe(uidBefore);

  await context.close();
});
