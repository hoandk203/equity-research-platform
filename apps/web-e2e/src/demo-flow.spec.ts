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
    const financial = page.locator('table').first();
    await expect(financial.locator('thead th')).toHaveCount(3);
    await expect(financial.locator('tbody tr')).toHaveCount(8);
    // Valuation and market rows on the latest session (P-06).
    const market = page.locator('section[aria-labelledby="compare-market-title"]');
    await expect(market.getByRole('heading')).toContainText('31/12/2025');
    await expect(market.locator('tr', { hasText: 'P/E' })).toContainText('lần');

    await page.getByRole('link', { name: 'Sàng lọc', exact: true }).click();
    await page.getByLabel('Năm tài chính', { exact: true }).selectOption('2024');
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
    const financial = page.locator('table').first();
    await expect(financial.locator('tbody tr')).toHaveCount(8);
    await expect(financial.locator('tbody').getByText('Chưa xác định')).toHaveCount(16);
  });

  test('an Oracle-side validation error is shown on the screening form', async ({ page }) => {
    await page.goto('/sang-loc?nam=2024&dk=NOT_A_METRIC~ge~1');
    await expect(page.locator('form .field-error')).toContainText('Chỉ số không tồn tại');
  });

  test('valuation before any annual report is available is shown as missing, not zero', async ({ page }) => {
    await page.goto('/so-sanh?nam=2023&ma=FPT,HPG&ngay=2023-03-31');
    const pe = page.locator('section[aria-labelledby="compare-market-title"] tr', { hasText: 'P/E' });
    await expect(pe.getByText('Chưa xác định')).toHaveCount(2);
    await expect(pe).toContainText('Chưa có BCTC');
  });
});

test.describe('prices and valuation', () => {
  test('the list shows the latest close, change and market cap', async ({ page }) => {
    await page.goto('/');
    const fpt = page.locator('tr', { hasText: 'Công ty Cổ phần FPT' });
    await expect(fpt).toContainText('95.800');
    await expect(fpt).toContainText('31/12/2025');
    await expect(fpt).toContainText('163.195,98');
  });

  test('company page: valuation card, candle chart, ranges and reviewed corrections', async ({ page }) => {
    await page.goto('/doanh-nghiep/FPT?tab=gia');
    const card = page.locator('section[aria-label="Định giá"]');
    await expect(card).toContainText('Giá đóng cửa 31/12/2025');
    await expect(card).toContainText('95.800');
    await expect(card).toContainText('20,77 lần');
    await expect(card).toContainText('Dùng BCTC năm 2024');
    await expect(card.getByText('Hồi cứu')).toBeVisible();
    await expect(page.locator('[data-testid="price-chart"] canvas').first()).toBeVisible();
    await page.getByRole('button', { name: 'Đường' }).click();
    await expect(page).toHaveURL(/kieu=duong/);
    await page.getByRole('button', { name: '3T' }).click();
    await expect(page).toHaveURL(/khoang=3T/);
    await expect(page.locator('section[aria-label="Chỉ số thị trường"]')).toContainText('Lợi suất 1 năm');
    await page.getByRole('button', { name: 'Giá gốc' }).click();
    await expect(page).toHaveURL(/gia=goc/);
    await expect(page.getByText('Phiên đã hiệu chỉnh (1)')).toBeVisible();
    await expect(page.locator('ul.corrections')).toContainText('18/07/2025');
    await expect(page.locator('ul.corrections')).toContainText('126.030');
    // MA toggles are disabled on unadjusted prices (jumps at ex-dates).
    await expect(page.getByLabel('MA20', { exact: true })).toBeDisabled();
  });

  test('screen by date combining financial, valuation and market metrics', async ({ page }) => {
    await page.goto('/sang-loc');
    await page.getByText('Theo ngày (có định giá, thị trường)').click();
    await page.getByLabel('Ngày', { exact: true }).fill('2025-06-30');
    await page.getByLabel('Chỉ số điều kiện 1').selectOption('ROE');
    await page.getByLabel('Ngưỡng điều kiện 1').fill('15');
    await page.getByLabel('Chỉ số điều kiện 2').selectOption('PE');
    await page.getByLabel('Toán tử điều kiện 2').selectOption('<=');
    await page.getByLabel('Ngưỡng điều kiện 2').fill('15');
    await page.getByRole('button', { name: '+ Thêm điều kiện' }).click();
    await page.getByLabel('Chỉ số điều kiện 3').selectOption('RETURN_1Y');
    await page.getByLabel('Toán tử điều kiện 3').selectOption('>');
    await page.getByLabel('Ngưỡng điều kiện 3').fill('0');
    await page.getByRole('button', { name: 'Sàng lọc', exact: true }).click();
    await expect(page).toHaveURL(/ngay=2025-06-30&dk=ROE~ge~15(;|%3B)PE~le~15(;|%3B)RETURN_1Y~gt~0/);
    await expect(page.getByRole('heading', { name: /Kết quả ngày 30\/06\/2025 \(BCTC năm 2024\)/ })).toBeVisible();
    await expect(page.locator('#result-title')).toContainText('/3 doanh nghiệp đạt');
    await expect(page.locator('.outcome-group thead').first()).toContainText('Định giá');
    await page.reload();
    await expect(page.getByRole('heading', { name: /Kết quả ngày 30\/06\/2025/ })).toBeVisible();
  });
});
