import { test, expect } from '@playwright/test';
test.use({
  viewport: { width: 1280, height: 900 },
  video: { mode: 'on', size: { width: 1280, height: 900 } },
});
test('inspection preserves focus and the main surface while views and dialogs change', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const main = page.getByRole('main');
  await expect
    .poll(() =>
      main.evaluate((element) =>
        element.getAnimations().some((animation) => animation.playState === 'running'),
      ),
    )
    .toBe(false);
  await page.waitForTimeout(900); // Pace the requested short visual walkthrough.
  const sort = page.getByRole('button', { name: 'Inspect Sort node 1.1', exact: true });
  await sort.click();
  await expect(sort).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Sort', exact: true })).toBeVisible();
  expect(
    await main.evaluate((element) =>
      element.getAnimations().some((animation) => animation.playState === 'running'),
    ),
  ).toBe(false);
  await page.waitForTimeout(1400);
  await page.getByRole('button', { name: 'Inspect Seq Scan node 1.1.1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seq Scan', exact: true })).toBeVisible();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Compare plans', exact: true }).click();
  await expect(page.getByText('98.55% lower', { exact: true })).toBeVisible();
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: 'Execution plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Execution plan', exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  const importButton = page.getByRole('button', { name: 'Import plan', exact: true });
  await importButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: 'docs/import-dialog.png',
    fullPage: false,
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(importButton).toBeFocused();
  await page.getByRole('button', { name: 'Capture instructions', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Capture instructions', exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: 'Execution plan', exact: true }).click();
  await expect(page.locator('.summary-stat.execution')).toContainText('21.659 ms');
  await page.waitForTimeout(1300);
  expect(errors).toEqual([]);
  const video = page.video();
  await context.close();
  expect(video).not.toBeNull();
  await video!.saveAs('docs/motion-demo.webm');
});
