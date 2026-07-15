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
