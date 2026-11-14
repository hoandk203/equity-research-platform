/**
 * Market-data API tests against the real Oracle database (no mocks), run on both schemas by
 * `nx run api:integration`. Both schemas hold the accepted market dataset (docs/18); the test
 * schema additionally holds rejected fixture batches from scripts/check_oracle_market.py.
 */
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import type {
  ApiErrorBody, CompanySummary, CompareResponse, MarketMetricCatalogItem, MarketSnapshot, PriceSeriesResponse,
  ScreeningResponse, ValuationResponse,
} from '@erp/contracts';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/app/setup';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config';
import { loadEnvFile } from '../src/config/env-file';

loadEnvFile(process.env['API_ENV_FILE'], { override: !!process.env['API_ENV_FILE'] });
const MAIN = (process.env['ORACLE_SCHEMA'] ?? '').toUpperCase() === 'ERP_DESIGN_V1';

let app: INestApplication;
let http: ReturnType<INestApplication['getHttpServer']>;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app, app.get<AppConfig>(APP_CONFIG));
  await app.init();
  http = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
});

const expectError = (body: ApiErrorBody, code: string) => {
  expect(body.error.code).toBe(code);
  expect(JSON.stringify(body)).not.toMatch(/ORA-\d{5}/);
};

describe(`market data (${process.env['ORACLE_SCHEMA']})`, () => {
  it('publishes the 17 market and valuation metrics', async () => {
    const cat = (await request(http).get('/api/market/catalog').expect(200)).body as MarketMetricCatalogItem[];
    expect(cat).toHaveLength(17);
    expect(cat.filter((m) => m.metricGroup === 'VALUATION').map((m) => m.metricCode)).toEqual(['MARKET_CAP', 'PE', 'PB', 'EPS', 'BVPS']);
    expect(cat.find((m) => m.metricCode === 'PE')).toMatchObject({ displayUnit: 'TIMES', formulaVersion: '1.0.0' });
  });

  it('returns the full adjusted daily series with its source by default', async () => {
    const r = (await request(http).get('/api/companies/fpt/prices').expect(200)).body as PriceSeriesResponse;
    expect(r).toMatchObject({ symbol: 'FPT', basis: 'ADJUSTED', interval: 'day', firstAvailable: '2022-01-04', lastAvailable: '2025-12-31' });
    expect(r.bars).toHaveLength(997);
    expect(r.bars.map((b) => b.date)).toEqual([...r.bars.map((b) => b.date)].sort());
    expect(r.source).toMatchObject({ code: 'VNDIRECT' });
    expect(r.source?.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const b of r.bars) {
      const [o, h, l] = [b.open ?? NaN, b.high ?? NaN, b.low ?? NaN];
      expect(l <= Math.min(o, b.close) && h >= Math.max(o, b.close)).toBe(true);
    }
  });

  it('returns unadjusted prices in VND and monthly bars from the materialized view', async () => {
    const raw = (await request(http).get('/api/companies/FPT/prices').query({ basis: 'UNADJUSTED', from: '2025-12-31', to: '2025-12-31' }).expect(200))
      .body as PriceSeriesResponse;
    expect(raw.bars).toEqual([{ date: '2025-12-31', open: 96800, high: 97000, low: 95200, close: 95800, volume: 3082600, corrected: false }]);
    const monthly = (await request(http).get('/api/companies/HPG/prices').query({ interval: 'month' }).expect(200)).body as PriceSeriesResponse;
    expect(monthly.bars).toHaveLength(48);
    expect(monthly.bars[0].date).toBe('2022-01-01');
  });

  it('flags corrected sessions and lists the reviewed corrections of the requested basis', async () => {
    const r = (await request(http).get('/api/companies/FPT/prices').query({ basis: 'UNADJUSTED', from: '2025-07-01', to: '2025-07-31' }).expect(200))
      .body as PriceSeriesResponse;
    expect(r.bars.find((b) => b.date === '2025-07-18')).toMatchObject({ close: 126000, corrected: true });
    expect(r.corrections).toEqual([expect.objectContaining({ date: '2025-07-18', basis: 'UNADJUSTED', field: 'CLOSE', providerValue: 126030, acceptedValue: 126000 })]);
  });

  it('validates price queries', async () => {
    expectError((await request(http).get('/api/companies/FPT/prices').query({ from: '2025-02-30' }).expect(400)).body, 'INVALID_DATE');
    expectError((await request(http).get('/api/companies/FPT/prices').query({ from: '2025-12-31', to: '2025-01-01' }).expect(400)).body, 'INVALID_RANGE');
    expectError((await request(http).get('/api/companies/FPT/prices').query({ basis: 'RAW' }).expect(400)).body, 'VALIDATION_FAILED');
    expectError((await request(http).get('/api/companies/FPT/prices').query({ to: '31/12/2025' }).expect(400)).body, 'VALIDATION_FAILED');
    expectError((await request(http).get('/api/companies/ZZZ/prices').expect(404)).body, 'COMPANY_NOT_FOUND');
  });

  it('uses the latest session on or before the requested date for market metrics', async () => {
    const last = (await request(http).get('/api/companies/HPG/market-metrics').expect(200)).body as MarketSnapshot;
    expect(last).toMatchObject({ tradingDate: '2025-12-31', sessionNo: 997 });
    for (const k of ['return1y', 'volatility1y', 'ma200', 'high52w', 'low52w'] as const) expect(typeof last[k]).toBe('number');
    const sunday = (await request(http).get('/api/companies/HPG/market-metrics').query({ date: '2025-06-29' }).expect(200)).body as MarketSnapshot;
    expect(sunday.tradingDate).toBe('2025-06-27');
    const early = (await request(http).get('/api/companies/HPG/market-metrics').query({ date: '2022-03-01' }).expect(200)).body as MarketSnapshot;
    expect(early.return1y).toBeNull(); // window not full yet: never a partial-year figure
    expect(early.ma20).not.toBeNull();
    const before = (await request(http).get('/api/companies/HPG/market-metrics').query({ date: '2021-06-30' }).expect(200)).body as MarketSnapshot;
    expect(before).toMatchObject({ tradingDate: null, close: null, return1y: null });
  });

  it('values a company with the retrospective policy and exact money strings', async () => {
    const v = (await request(http).get('/api/companies/FPT/valuation').query({ date: '2025-12-31' }).expect(200)).body as ValuationResponse;
    expect(v).toMatchObject({ tradingDate: '2025-12-31', policyCode: 'RETRO-APR01', reportYear: 2024, retrospective: true, close: 95800,
      sharesOutstanding: '1703507121', peStatus: 'VALID', pbStatus: 'VALID', marketCapStatus: 'VALID' });
    expect(v.marketCap).toBe((BigInt(95800) * BigInt(1703507121)).toString());
    expect(v.pe).toBeCloseTo(Number(v.marketCap) / Number(v.inputs.parentNetIncome), 9);
    expect(v.pb).toBeCloseTo(Number(v.marketCap) / Number(v.inputs.parentEquity), 9);
    const big = (x: string | null) => BigInt(x ?? 'x');
    expect(big(v.inputs.parentEquity)).toBe(big(v.inputs.equity) - big(v.inputs.nonControllingInterest));
    const boundary = (await request(http).get('/api/companies/FPT/valuation').query({ date: '2024-03-29' }).expect(200)).body as ValuationResponse;
    expect(boundary.reportYear).toBe(2022);
    const after = (await request(http).get('/api/companies/FPT/valuation').query({ date: '2024-04-01' }).expect(200)).body as ValuationResponse;
    expect(after.reportYear).toBe(2023);
    const noReport = (await request(http).get('/api/companies/FPT/valuation').query({ date: '2023-03-31' }).expect(200)).body as ValuationResponse;
    expect(noReport).toMatchObject({ reportYear: 2021, peStatus: 'NO_REPORT', pe: null, pb: null });
    expect(noReport.marketCap).not.toBeNull();
    const none = (await request(http).get('/api/companies/FPT/valuation').query({ date: '2020-01-01' }).expect(200)).body as ValuationResponse;
    expect(none).toMatchObject({ tradingDate: null, marketCap: null, peStatus: 'NO_PRICE' });
  });

  it('adds the latest quote to the company list', async () => {
    const all = (await request(http).get('/api/companies').expect(200)).body as CompanySummary[];
    for (const c of all.filter((x) => ['FPT', 'HPG', 'VNM'].includes(x.symbol))) {
      expect(c.quote).toMatchObject({ tradingDate: '2025-12-31' });
      expect(c.quote?.marketCap).toMatch(/^\d+$/);
    }
  });

  it('screens by date across financial, valuation and market metrics', async () => {
    const res = (await request(http).post('/api/screening').send({
      date: '2025-06-29',
      conditions: [{ metric: 'ROE', op: '>=', value: 0.15 }, { metric: 'PE', op: '<=', value: 15 }, { metric: 'RETURN_1Y', op: '>', value: 0 }],
    }).expect(200)).body as ScreeningResponse;
    expect(res).toMatchObject({ date: '2025-06-29', year: 2024 });
    expect(res.rows).toHaveLength(3);
    for (const row of res.rows) {
      expect(row).toMatchObject({ tradingDate: '2025-06-27', reportYear: 2024 });
      expect(row.conditions.map((c) => c.group)).toEqual(['FINANCIAL', 'VALUATION', 'MARKET']);
      const expected = row.conditions.some((c) => c.conditionStatus === 'FAIL') ? 'FAIL'
        : row.conditions.some((c) => c.conditionStatus === 'UNKNOWN') ? 'UNKNOWN' : 'PASS';
      expect(row.overallStatus).toBe(expected);
    }
    const pe = res.rows[0].conditions[1];
    expect(pe).toMatchObject({ unit: 'TIMES', metricStatus: 'VALID' });
    const legacy = (await request(http).post('/api/screening').send({ year: 2024, conditions: [{ metric: 'ROE', op: '>=', value: 0.15 }] }).expect(200))
      .body as ScreeningResponse;
    expect(legacy).toMatchObject({ year: 2024, date: null });
    expect(legacy.rows.every((r) => r.tradingDate === null && r.conditions[0].group === 'FINANCIAL')).toBe(true);
  });

  it('marks valuation conditions UNKNOWN before any report or price is available', async () => {
    const res = (await request(http).post('/api/screening').send({ date: '2021-06-30', conditions: [{ metric: 'PE', op: '<=', value: 15 }] }).expect(200))
      .body as ScreeningResponse;
    expect(res.rows.map((r) => r.overallStatus)).toEqual(['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
    expect(res.rows[0].conditions[0].metricStatus).toBe('NO_PRICE');
  });

  it('validates the screening mode and date', async () => {
    const conditions = [{ metric: 'PE', op: '<=', value: 15 }];
    expectError((await request(http).post('/api/screening').send({ conditions }).expect(400)).body, 'VALIDATION_FAILED');
    expectError((await request(http).post('/api/screening').send({ year: 2024, date: '2025-06-30', conditions }).expect(400)).body, 'VALIDATION_FAILED');
    expectError((await request(http).post('/api/screening').send({ date: '2025-13-01', conditions }).expect(400)).body, 'INVALID_DATE');
    expectError((await request(http).post('/api/screening').send({ date: '2025-06-30', conditions: [{ metric: 'NOPE', op: '<=', value: 1 }] }).expect(400)).body,
      'UNKNOWN_METRIC');
  });

  it('adds valuation and market rows to the comparison', async () => {
    const c = (await request(http).get('/api/compare').query({ symbols: 'FPT,VNM', year: 2024, date: '2025-06-30' }).expect(200)).body as CompareResponse;
    expect(c.date).toBe('2025-06-30');
    expect(c.marketRows).toHaveLength(17);
    const pe = c.marketRows.find((r) => r.metricCode === 'PE');
    expect(pe?.cells.map((x) => [x.symbol, x.status, x.tradingDate])).toEqual([['FPT', 'VALID', '2025-06-30'], ['VNM', 'VALID', '2025-06-30']]);
    const def = (await request(http).get('/api/compare').query({ symbols: 'FPT,HPG', year: 2024 }).expect(200)).body as CompareResponse;
    expect(def.date).toBe('2025-12-31');
    expectError((await request(http).get('/api/compare').query({ symbols: 'FPT,HPG', year: 2024, date: 'x' }).expect(400)).body, 'VALIDATION_FAILED');
  });
});

(MAIN ? describe : describe.skip)('accepted market dataset (ERP_DESIGN_V1)', () => {
  it('shows the reviewed VNM correction of 13/05/2025 (close outside the day range at the provider)', async () => {
    const r = (await request(http).get('/api/companies/VNM/prices').query({ basis: 'UNADJUSTED', from: '2025-05-13', to: '2025-05-13' }).expect(200))
      .body as PriceSeriesResponse;
    expect(r.bars[0]).toMatchObject({ open: 58900, high: 59000, low: 58300, close: 58500, corrected: true });
    expect(r.corrections[0]).toMatchObject({ field: 'CLOSE', providerValue: 56500, acceptedValue: 58500 });
  });

  it('values the three companies on 31/12/2025 with FY2024 reports', async () => {
    const pe: Record<string, number> = {};
    for (const s of ['FPT', 'HPG', 'VNM']) {
      const v = (await request(http).get(`/api/companies/${s}/valuation`).expect(200)).body as ValuationResponse;
      expect(v.reportYear).toBe(2024);
      pe[s] = Math.round((v.pe ?? NaN) * 100) / 100;
    }
    expect(pe).toEqual({ FPT: 20.77, HPG: 16.86, VNM: 13.62 });
  });

  it('lists the market import batches as completed with no errors', async () => {
    const batches = (await request(http).get('/api/imports').expect(200)).body as Array<{ contractVersion: string; status: string; errorCount: number }>;
    const market = batches.filter((b) => b.contractVersion === 'erp-market/1.0.0');
    expect(market.length).toBeGreaterThanOrEqual(3);
    expect(market.every((b) => b.status === 'COMPLETED' && b.errorCount === 0)).toBe(true);
  });
});
