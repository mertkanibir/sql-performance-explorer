import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const baselineSample = readFileSync(new URL('../demo/before.json', import.meta.url), 'utf8');
test('explores captured plan, saves it, and reloads browser-local library', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Execution plan', exact: true })).toBeVisible();
  await expect(page.locator('.summary-stat.execution')).toContainText('21.659');
  await expect(page.getByRole('heading', { name: 'Seq Scan', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/screenshot.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Inspect Sort node 1.1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sort', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Limit node 1', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Inspect Sort node 1.1', exact: true }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(
    page.getByRole('button', { name: 'Inspect Sort node 1.1', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Analysis saved');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Orders lookup · baseline/ })).toBeVisible();
});
test('shows malformed input errors, imports estimated-only plans, and exports real report', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import plan', exact: true }).click();
  await page.getByLabel('EXPLAIN JSON', { exact: true }).fill('oops');
  await page.getByRole('button', { name: 'Analyze plan' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid JSON');
  await page.getByLabel('Analysis name').fill('My captured query');
  await page.getByLabel('EXPLAIN JSON', { exact: true }).fill(baselineSample);
  await page.getByRole('button', { name: 'Analyze plan' }).click();
  await expect(page.getByRole('heading', { name: 'My captured query', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report' }).click();
  const reportDownload = await download;
  expect(reportDownload.suggestedFilename()).toBe('planscope-report.md');
  const report = readFileSync((await reportDownload.path())!, 'utf8');
  expect(report).toContain('My captured query');
  expect(report).toContain('21.66 ms');
  expect(report).toContain('Never sum them');
  await page.getByRole('button', { name: 'Estimates only', exact: true }).click();
  await expect(page.getByText('No execution timing recorded')).toBeVisible();
  await expect(page.getByRole('button', { name: /Estimates only.*Node 1/ })).toBeVisible();
});
test('compares real plans, imports a comparison, and swaps plans', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto('/');
  await page.getByRole('button', { name: /Compare plans/ }).click();
  await expect(page.getByRole('heading', { name: 'Compare plans', exact: true })).toBeVisible();
  await expect(page.getByText('98.55% lower', { exact: true })).toBeVisible();
  await expect(page.getByText('Bitmap Index Scan', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/comparison.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Swap plans' }).click();
  await expect(
    page.getByRole('heading', { name: 'Orders lookup · indexed', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/higher/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Import comparison' }).click();
  await page.getByLabel('Analysis name').fill('Imported comparison');
  await page.getByLabel('EXPLAIN JSON', { exact: true }).fill(baselineSample);
  await page.getByRole('button', { name: 'Analyze plan' }).click();
  await expect(
    page.getByRole('heading', { name: 'Imported comparison', exact: true }),
  ).toBeVisible();
});
test('uploads JSON, downloads SQL, and supports keyboard dialog dismissal', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Capture instructions/ }).click();
  const sqlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download experiment SQL' }).click();
  expect((await sqlDownload).suggestedFilename()).toBe('planscope-setup.sql');
  await page.getByRole('button', { name: 'I have a plan' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'uploaded.json',
    mimeType: 'application/json',
    buffer: Buffer.from(baselineSample),
  });
  await expect(page.getByLabel('Analysis name')).toHaveValue('uploaded');
  await page.getByRole('button', { name: 'Analyze plan' }).click();
  await expect(page.getByRole('heading', { name: 'uploaded', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import plan', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
test('mobile layout is usable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Execution plan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import plan', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /Compare plans/ }).click();
  await expect(page.getByText('98.55% lower', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const costPlan = {
  'Node Type': 'Aggregate',
  'Startup Cost': 5,
  'Total Cost': 10,
  'Plan Rows': 1,
  Plans: [
    {
      'Node Type': 'Seq Scan',
      'Startup Cost': 0,
      'Total Cost': 5,
      'Plan Rows': 1,
    },
  ],
};
const zeroTimePlan = {
  ...costPlan,
  'Actual Rows': 0,
  'Actual Loops': 1,
  'Actual Total Time': 0,
  Plans: costPlan.Plans.map((node) => ({
    ...node,
    'Actual Rows': 0,
    'Actual Loops': 1,
    'Actual Total Time': 0,
  })),
};

test('zero-time ANALYZE keeps measured work bars at zero instead of showing cost', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import plan', exact: true }).click();
  await page
    .getByLabel('EXPLAIN JSON', { exact: true })
    .fill(JSON.stringify([{ Plan: zeroTimePlan }]));
  await page.getByRole('button', { name: 'Analyze plan' }).click();
  const heading = page.locator('.tree-column-head > span').last();
  await expect(heading).toContainText('INCLUSIVE WORK');
  await expect(heading).toContainText('TIME × LOOPS');
  await expect(page.locator('.row-time > strong')).toHaveText(['0 ms', '0 ms']);
  expect(
    await page
      .locator('.mini-track > span')
      .evaluateAll((bars) => bars.map((bar) => (bar as HTMLElement).style.width)),
  ).toEqual(['0%', '0%']);
  await expect(page.locator('.tree-footnote')).toContainText('inclusive node work');
  await expect(page.locator('.tree-footnote')).toContainText('Timings overlap');
});

for (const fixture of [
  { name: 'plain EXPLAIN', plan: costPlan },
  {
    name: 'ANALYZE TIMING OFF',
    plan: {
      ...costPlan,
      'Actual Rows': 1,
      'Actual Loops': 1,
      Plans: costPlan.Plans.map((node) => ({
        ...node,
        'Actual Rows': 1,
        'Actual Loops': 1,
      })),
    },
  },
]) {
  test(`${fixture.name} presents cost bars with planner labels and cost-specific guidance`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Import plan', exact: true }).click();
    await page
      .getByLabel('EXPLAIN JSON', { exact: true })
      .fill(JSON.stringify([{ Plan: fixture.plan }]));
    await page.getByRole('button', { name: 'Analyze plan' }).click();
    const heading = page.locator('.tree-column-head > span').last();
    await expect(heading).toContainText('ESTIMATED COST');
    await expect(heading).toContainText('PLANNER UNITS');
    await expect(heading).not.toContainText('TIME × LOOPS');
    await expect(page.locator('.row-time > strong')).toHaveText(['10 cost', '5 cost']);
    expect(
      await page
        .locator('.mini-track > span')
        .evaluateAll((bars) => bars.map((bar) => (bar as HTMLElement).style.width)),
    ).toEqual(['100%', '50%']);
    await expect(page.locator('.tree-footnote')).toContainText(
      'inclusive estimated node costs in planner units',
    );
    await expect(page.locator('.tree-footnote')).toContainText('Costs include descendants');
    await expect(page.locator('.tree-footnote')).not.toContainText('Timings overlap');
  });
}

test('reduced motion keeps controls, measurements, and inspector usable without moving surfaces', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Execution plan', exact: true })).toBeVisible();
  await expect(page.locator('.summary-stat.execution')).toContainText('21.659 ms');
  expect(
    await page.evaluate(() =>
      document.getAnimations().some((animation) => animation.playState === 'running'),
    ),
  ).toBe(false);
  await page.getByRole('button', { name: 'Inspect Sort node 1.1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sort', exact: true })).toBeVisible();
  expect(
    await page.getByRole('main').evaluate((element) => getComputedStyle(element).opacity),
  ).toBe('1');
  expect(
    await page.evaluate(() =>
      document.getAnimations().some((animation) => animation.playState === 'running'),
    ),
  ).toBe(false);
  await page.getByRole('button', { name: 'Compare plans', exact: true }).click();
  await expect(page.getByText('98.55% lower', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.getAnimations().some((animation) => animation.playState === 'running'),
    ),
  ).toBe(false);
});
