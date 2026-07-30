import { expect, test } from '@playwright/test';

/**
 * Room text chat: two clients exchange messages both ways, and a reload
 * restores the history from the welcome snapshot's chatTail.
 */
test('chat flows both ways and survives a reload', async ({ browser }) => {
  const room = `e2e-chat-${Math.random().toString(36).slice(2, 10)}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  await contextA.addInitScript(() => localStorage.setItem('jaffre-name', 'Alice'));
  await contextB.addInitScript(() => localStorage.setItem('jaffre-name', 'Bruno'));
  const a = await contextA.newPage();
  const b = await contextB.newPage();

  await a.goto(`/#room/${room}`);
  await b.goto(`/#room/${room}`);

  // The lobby chat panel is always expanded.
  const inputA = a.getByTestId('chat-input');
  const inputB = b.getByTestId('chat-input');
  await expect(inputA).toBeVisible();
  await expect(inputB).toBeVisible();

  // A → B (Enter sends).
  await inputA.fill('salut la table!');
  await inputA.press('Enter');
  await expect(a.getByTestId('chat-messages')).toContainText('salut la table!');
  await expect(b.getByTestId('chat-messages')).toContainText('Alice');
  await expect(b.getByTestId('chat-messages')).toContainText('salut la table!');

  // B → A.
  await inputB.fill('allo Alice');
  await inputB.press('Enter');
  await expect(a.getByTestId('chat-messages')).toContainText('Bruno');
  await expect(a.getByTestId('chat-messages')).toContainText('allo Alice');

  // Reload A: the welcome snapshot's chatTail restores both messages.
  await a.reload();
  await expect(a.getByTestId('chat-messages')).toContainText('salut la table!');
  await expect(a.getByTestId('chat-messages')).toContainText('allo Alice');

  await contextA.close();
  await contextB.close();
});

/**
 * H1 (Wave 4a): the server narrates table moments (sat/left/dropped/bot
 * takeover/back/started) as system chat entries; the client localizes the
 * code+name into a sentence and renders it as a muted line, not a bubble.
 */
test('sitting down drops a muted system chat line for everyone at the table', async ({
  browser,
}) => {
  const room = `e2e-chat-sat-${Math.random().toString(36).slice(2, 10)}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  await contextA.addInitScript(() => localStorage.setItem('jaffre-name', 'Alice'));
  await contextB.addInitScript(() => localStorage.setItem('jaffre-name', 'Bruno'));
  const a = await contextA.newPage();
  const b = await contextB.newPage();

  await a.goto(`/#room/${room}`);
  await b.goto(`/#room/${room}`);

  await a.getByTestId('seat-row-0').getByRole('button', { name: 'Sit here' }).click();

  // Table narration, not a message from a person: both the sitter and the
  // still-spectating second client see the same line, unprompted.
  await expect(a.getByTestId('chat-messages')).toContainText('Alice sat down.');
  await expect(b.getByTestId('chat-messages')).toContainText('Alice sat down.');

  await contextA.close();
  await contextB.close();
});
