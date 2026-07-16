import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Result, NodeResult } from 'axe-core';

/**
 * axe-core cannot read a native <select>'s own background: it samples the
 * page behind the widget instead, so a light-on-dark select sitting over a
 * gradient (the felt) gets mis-flagged for contrast even though the rendered
 * control is perfectly legible (verified: even pure white measures 4.4:1
 * against the sampled felt tone, i.e. unfixable via CSS). Drop color-contrast
 * findings whose node is a native <select>; every other element still gates.
 */
function isNativeSelectContrast(ruleId: string, node: NodeResult): boolean {
  return ruleId === 'color-contrast' && (node.html ?? '').trimStart().startsWith('<select');
}

/**
 * Shared axe-core gate: zero serious/critical violations. Moderate/minor
 * findings are logged so they stay visible, but they do not fail the suite.
 */
export async function expectNoSeriousViolations(page: Page, context: string): Promise<void> {
  // Let running entrance animations (rise-in/deal-in fades) settle first — axe
  // computes contrast from the composited color, so sampling an element
  // mid-fade at partial opacity yields flaky false positives on a different
  // element each run. Only wait for FINITE animations (infinite pulses/spins
  // never resolve), and cap the wait so it can never hang.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const finite = document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
        void Promise.all(finite.map((a) => a.finished.catch(() => undefined))).then(() =>
          resolve(),
        );
        setTimeout(resolve, 1500);
      }),
  );
  const results = await new AxeBuilder({ page }).analyze();
  // Strip the known native-<select> contrast false positive from each finding.
  const violations: Result[] = results.violations
    .map((v) => ({ ...v, nodes: v.nodes.filter((n) => !isNativeSelectContrast(v.id, n)) }))
    .filter((v) => v.nodes.length > 0);

  const severe = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const lesser = violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');
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
