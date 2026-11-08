import { expect, test } from '@playwright/test';

/** The demo scenario from docs/14 §7, run in a real browser against the real API + Oracle. */
test.describe('demo flow', () => {
  test('search without accents, open a company and read its audited figures', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Tìm doanh nghiệp').fill('hoa phat');
    await expect(page).toHaveURL(/q=hoa(\+|%20)phat/);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Hòa Phát');

    await page.getByLabel('Tìm doanh nghiệp').fill('xyz không có');
    await expect(page.getByText('Không tìm thấy doanh nghiệp phù hợp')).toBeVisible();

    await page.goto('/doanh-nghiep/VNM?nam=2025&tab=bao-cao');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sữa Việt Nam');
    const assets = page.locator('tr', { hasText: 'TỔNG CỘNG TÀI SẢN' });
    await expect(assets).toContainText('53.312,37');
    await assets.getByRole('button', { name: 'Xem hiệu chỉnh' }).click();
    await expect(page.getByText('Lý do', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Báo cáo kiểm toán (PDF)' }).first()).toBeVisible();

    // Full VND mode shows the exact audited figure.
    await page.getByLabel('Số tiền').selectOption('VND');
    await expect(assets).toContainText('53.312.370.717.301');
    await page.getByLabel('Số tiền').selectOption('TY');
  });

  test('trace VNM ROE 2025 down to the corrected equity and its PDF page', async ({ page }) => {
    await page.goto('/doanh-nghiep/VNM?nam=2025&tab=chi-so');
    await expect(page.locator('.metric-card')).toHaveCount(8);
    const roe = page.locator('.metric-card', { hasText: 'Sinh lời trên tổng vốn chủ sở hữu bình quân' });
    await roe.getByRole('link', { name: /Truy vết/ }).click();
    await expect(page).toHaveURL(/tab=truy-vet&ketqua=\d+/);
    await expect(page.locator('.formula')).toHaveText('NI[t]/((E[t-1]+E[t])/2)');
    const inputs = page.locator('section[aria-labelledby="lineage-title"] tbody tr');
    await expect(inputs).toHaveCount(3);
    await expect(inputs.nth(2)).toContainText('Đã hiệu chỉnh');
    await expect(inputs.nth(2)).toContainText('trang');
  });

  test('build a comparison from the basket and screen with the documented example', async ({ page }) => {
    await page.goto('/');
    await page.locator('tr', { hasText: 'FPT' }).getByRole('button', { name: '+ So sánh' }).click();
    await page.locator('tr', { hasText: 'VNM' }).getByRole('button', { name: '+ So sánh' }).click();
    await expect(page.getByRole('link', { name: /So sánh\s*2/ })).toBeVisible();
    await page.getByRole('link', { name: /So sánh\s*2/ }).click();
    await expect(page.locator('thead th')).toHaveCount(3);
    await expect(page.locator('tbody tr')).toHaveCount(8);

    await page.getByRole('link', { name: 'Sàng lọc', exact: true }).click();
    await page.getByLabel('Năm tài chính').selectOption('2024');
    await page.getByRole('button', { name: 'Sàng lọc', exact: true }).click();
    await expect(page).toHaveURL(/nam=2024&dk=NET_MARGIN~ge~10/);
    await expect(page.getByRole('heading', { name: /2\/3 doanh nghiệp đạt/ })).toBeVisible();
    const pass = page.locator('.outcome-group').nth(0);
    const fail = page.locator('.outcome-group').nth(2);
    await expect(pass).toContainText('FPT');
    await expect(pass).toContainText('VNM');
    await expect(fail).toContainText('HPG');
    await expect(fail).toContainText('8,66 %');

    // The executed query is in the URL: a reload reproduces the same result.
    await page.reload();
    await expect(page.getByRole('heading', { name: /2\/3 doanh nghiệp đạt/ })).toBeVisible();
  });

  test('import monitoring shows real batches without errors', async ({ page }) => {
    await page.goto('/dot-nhap');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.getByRole('link', { name: '#1', exact: true }).click();
    await expect(page.getByText('Không có lỗi')).toBeVisible();
    await expect(page.locator('tr', { hasText: 'reviewed-pilot-' }).last()).toContainText('132');
  });
});

test.describe('edge states', () => {
  test('unknown company shows a clear message', async ({ page }) => {
    await page.goto('/doanh-nghiep/ZZZ');
    // Next.js keeps its own hidden route announcer with role=alert; target the app's error box.
    await expect(page.locator('.state-error')).toContainText('Không tìm thấy doanh nghiệp có mã ZZZ');
  });

  test('the base year 2022 has reports but no metrics', async ({ page }) => {
    await page.goto('/doanh-nghiep/FPT?nam=2022&tab=chi-so');
    await expect(page.getByText('Chưa có chỉ số cho năm 2022')).toBeVisible();
  });

  test('comparing the base year shows UNKNOWN, never zero', async ({ page }) => {
    await page.goto('/so-sanh?nam=2022&ma=FPT,HPG');
    await expect(page.locator('tbody tr')).toHaveCount(8);
    await expect(page.locator('tbody').getByText('Chưa xác định')).toHaveCount(16);
  });

  test('an Oracle-side validation error is shown on the screening form', async ({ page }) => {
    await page.goto('/sang-loc?nam=2024&dk=NOT_A_METRIC~ge~1');
    await expect(page.locator('form .field-error')).toContainText('Chỉ số không tồn tại');
  });

  test('the price tab never shows invented data', async ({ page }) => {
    await page.goto('/doanh-nghiep/HPG?tab=gia');
    await expect(page.getByText('Chưa có dữ liệu giá đã nghiệm thu.')).toBeVisible();
  });
});
