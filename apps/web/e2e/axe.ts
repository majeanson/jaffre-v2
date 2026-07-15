import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Shared axe-core gate: zero serious/critical violations. Moderate/minor
 * findings are logged so they stay visible, but they do not fail the suite.
 */
export async function expectNoSeriousViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const lesser = results.violations.filter(
    (v) => v.impact !== 'serious' && v.impact !== 'critical',
  );
  for (const v of lesser) {
    console.log(
      `[a11y] ${context}: ${v.impact ?? 'unknown'} — ${v.id} (${v.nodes.length} node(s))`,
    );
  }
  expect(
    severe.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(' ')),
    })),
  ).toEqual([]);
}
