import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { workspaceRoot } from '@nx/devkit';

/** Fixed-URL screenshots of every screen (and Swagger) for documentation, in dist/screenshots. */
const OUT = join(workspaceRoot, 'dist/screenshots');
const SHOTS: Array<[string, string]> = [
  ['01-danh-sach', '/'],
  ['02-chi-tiet-bao-cao', '/doanh-nghiep/VNM?nam=2025&tab=bao-cao'],
  ['03-chi-tiet-chi-so', '/doanh-nghiep/VNM?nam=2025&tab=chi-so'],
  ['05-sang-loc', '/sang-loc?nam=2024&dk=NET_MARGIN~ge~10;CURRENT_RATIO~ge~1'],
  ['06-so-sanh', '/so-sanh?nam=2024&ma=FPT,HPG,VNM'],
  ['07-dot-nhap', '/dot-nhap?batch=1'],
];

test('capture screens', async ({ page }) => {
  for (const [name, path] of SHOTS) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Wait until every query on the page has rendered (no loading placeholder left).
    await expect(page.locator('.state-loading')).toHaveCount(0);
    await expect(page.locator('.state-error')).toHaveCount(0);
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  }
  // Lineage needs a result id that exists in this database: open it through the UI.
  await page.goto('/doanh-nghiep/VNM?nam=2025&tab=chi-so');
  await page.locator('.metric-card', { hasText: 'Sinh lời trên tổng vốn chủ sở hữu bình quân' }).getByRole('link', { name: /Truy vết/ }).click();
  await expect(page.locator('section[aria-labelledby="lineage-title"] tbody tr')).toHaveCount(3);
  await page.screenshot({ path: join(OUT, '04-truy-vet.png'), fullPage: true });

  await page.goto('http://localhost:4000/api/docs');
  await expect(page.getByText('/api/screening')).toBeVisible();
  await page.screenshot({ path: join(OUT, '08-swagger.png'), fullPage: true });
});
