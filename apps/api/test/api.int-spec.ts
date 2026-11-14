/**
 * API tests against the real Oracle AI Database 26ai (no mocks).
 * Run with API_ENV_FILE pointing at apps/api/.env (ERP_APP on ERP_DESIGN_V1) and again at
 * apps/api/.env.test (ERP_TEST_APP on ERP_IMPORT_TEST, which holds edge-case fixtures).
 */
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import type {
  ApiErrorBody, CompanySummary, CompareResponse, HealthResponse, ImportBatch, LineageResponse,
  MetricCatalogItem, MetricsResponse, ReportLinesResponse, ScreeningResponse,
} from '@erp/contracts';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/app/setup';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config';
import { loadEnvFile } from '../src/config/env-file';

loadEnvFile(process.env['API_ENV_FILE'], { override: !!process.env['API_ENV_FILE'] });
const MAIN = (process.env['ORACLE_SCHEMA'] ?? '').toUpperCase() === 'ERP_DESIGN_V1';
const STATUSES = ['VALID', 'CALCULATED_PROVISIONAL', 'MISSING_INPUT', 'INVALID_DENOMINATOR', 'BLOCKED_INPUT_QUALITY'];

let app: INestApplication;
let http: ReturnType<INestApplication['getHttpServer']>;
let config: AppConfig;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  await app.init();
  http = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
});

const expectError = (body: ApiErrorBody, code?: string) => {
  expect(typeof body.error.message).toBe('string');
  expect(body.error.requestId).toBeTruthy();
  if (code) expect(body.error.code).toBe(code);
  // Never leak Oracle internals.
  expect(JSON.stringify(body)).not.toMatch(/ORA-\d{5}|at \w+ \(/);
};

describe(`common behaviour (${process.env['ORACLE_SCHEMA']})`, () => {
  it('connects as the configured application account and tags the session with the request id', async () => {
    const res = await request(http).get('/api/health').set('X-Request-Id', 'itest-health-0001').expect(200);
    const body = res.body as HealthResponse;
    expect(body.database.user).toBe(config.oracle.user);
    expect(['ERP_APP', 'ERP_TEST_APP']).toContain(body.database.user);
    expect(body.database.clientIdentifier).toBe('itest-health-0001');
    expect(res.headers['x-request-id']).toBe('itest-health-0001');
  });

  it('replaces a malformed request id with a generated one', async () => {
    const res = await request(http).get('/api/health').set('X-Request-Id', 'bad id;drop').expect(200);
    expect(res.headers['x-request-id']).toMatch(/^req-[0-9a-f-]{36}$/);
  });

  it('allows the frontend origin through CORS and exposes the request id', async () => {
    const res = await request(http).get('/api/health').set('Origin', 'http://localhost:3000').expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-expose-headers']).toContain('X-Request-Id');
  });

  it('lists companies and searches without accents', async () => {
    const all = (await request(http).get('/api/companies').expect(200)).body as CompanySummary[];
    expect(all.length).toBeGreaterThanOrEqual(3);
    const hp = (await request(http).get('/api/companies').query({ q: 'hoa phat' }).expect(200)).body as CompanySummary[];
    expect(hp.map((c) => c.symbol)).toEqual(['HPG']);
    const milk = (await request(http).get('/api/companies').query({ q: 'sữa' }).expect(200)).body as CompanySummary[];
    expect(milk.map((c) => c.symbol)).toEqual(['VNM']);
    expect((await request(http).get('/api/companies').query({ q: 'fpt' }).expect(200)).body[0].symbol).toBe('FPT');
    expect((await request(http).get('/api/companies').query({ q: 'không tồn tại' }).expect(200)).body).toEqual([]);
    expectError((await request(http).get('/api/companies').query({ q: 'x'.repeat(51) }).expect(400)).body, 'VALIDATION_FAILED');
  });

  it('validates symbols and returns 404 for unknown companies', async () => {
    expectError((await request(http).get("/api/companies/VNM'--").expect(400)).body, 'INVALID_SYMBOL');
    expectError((await request(http).get('/api/companies/ZZZ').expect(404)).body, 'COMPANY_NOT_FOUND');
    const vnm = (await request(http).get('/api/companies/vnm').expect(200)).body;
    expect(vnm.symbol).toBe('VNM');
    expect(vnm.reportSets.length).toBeGreaterThan(0);
  });

  it('returns one report line per financial item, never inventing missing values', async () => {
    const res = (await request(http).get('/api/companies/VNM/reports').query({ year: 2025 }).expect(200)).body as ReportLinesResponse;
    expect(res.lines.length).toBe(11);
    for (const l of res.lines) {
      if (l.lineStatus === 'MISSING') expect(l.effectiveValueVnd).toBeNull();
      if (l.effectiveValueVnd !== null) expect(l.effectiveValueVnd).toMatch(/^-?\d+$/);
    }
    const none = (await request(http).get('/api/companies/VNM/reports').query({ year: 1999 }).expect(200)).body as ReportLinesResponse;
    expect(none.reportSet).toBeNull();
    expect(none.lines).toEqual([]);
    expectError((await request(http).get('/api/companies/VNM/reports').query({ year: 'abc' }).expect(400)).body);
    expectError((await request(http).get('/api/companies/VNM/reports').expect(400)).body);
  });

  it('exposes the metric catalog with formulas', async () => {
    const cat = (await request(http).get('/api/metrics/catalog').expect(200)).body as MetricCatalogItem[];
    const current = cat.filter((c) => c.formulaVersion === '1.0.0');
    expect(current.map((c) => c.metricCode).sort()).toEqual(
      ['CFO_AVG_ASSETS', 'CURRENT_RATIO', 'GROSS_MARGIN', 'LIABILITIES_ASSETS', 'NET_MARGIN', 'REVENUE_GROWTH', 'ROA', 'ROE'],
    );
    expect(current.find((c) => c.metricCode === 'ROE')).toMatchObject({ displayUnit: 'PERCENT', inputCount: 3, requiresPrevious: true });
  });

  it('only returns known metric statuses and no values for non-valid results', async () => {
    const res = (await request(http).get('/api/companies/FPT/metrics').query({ year: 2024 }).expect(200)).body as MetricsResponse;
    for (const m of res.metrics) {
      expect(STATUSES).toContain(m.status);
      if (!['VALID', 'CALCULATED_PROVISIONAL'].includes(m.status)) expect(m.value).toBeNull();
    }
    const base = (await request(http).get('/api/companies/FPT/metrics').query({ year: 2022 }).expect(200)).body as MetricsResponse;
    expect(base.metrics).toEqual([]);
  });

  it('returns 404/400 for lineage of unknown or malformed result ids', async () => {
    expectError((await request(http).get('/api/metric-results/999999999/lineage').expect(404)).body, 'RESULT_NOT_FOUND');
    expectError((await request(http).get('/api/metric-results/abc/lineage').expect(400)).body, 'INVALID_ID');
  });

  it('rejects invalid screening input before or inside Oracle with HTTP 400', async () => {
    const post = (body: unknown) => request(http).post('/api/screening').send(body as object);
    const ok = { metric: 'ROE', op: '>=', value: 0.1 };
    expectError((await post({ year: 2024.5, conditions: [ok] }).expect(400)).body, 'VALIDATION_FAILED');
    expectError((await post({ year: 2024, conditions: [] }).expect(400)).body, 'VALIDATION_FAILED');
    expectError((await post({ year: 2024, conditions: Array(11).fill(ok) }).expect(400)).body, 'VALIDATION_FAILED');
    expectError((await post({ year: 2024, conditions: [{ ...ok, op: 'LIKE' }] }).expect(400)).body, 'VALIDATION_FAILED');
    expectError((await post({ year: 2024, conditions: [{ ...ok, value: 'abc' }] }).expect(400)).body, 'VALIDATION_FAILED');
    expectError((await post({ year: 2024, conditions: [{ ...ok, metric: "ROE' OR '1'='1" }] }).expect(400)).body, 'VALIDATION_FAILED');
    expectError((await post({ year: 2024, conditions: [ok], extra: 1 }).expect(400)).body, 'VALIDATION_FAILED');
    // Well-formed but unknown metric: rejected by pkg_screening (ORA-20403) and mapped to 400.
    expectError((await post({ year: 2024, conditions: [{ ...ok, metric: 'NOT_A_METRIC' }] }).expect(400)).body, 'UNKNOWN_METRIC');
  });

  it('treats a year without metrics as UNKNOWN, never as FAIL', async () => {
    const res = (await request(http).post('/api/screening').send({ year: 2022, conditions: [{ metric: 'ROE', op: '>=', value: 0 }] }).expect(200)).body as ScreeningResponse;
    expect(res.rows.length).toBeGreaterThanOrEqual(3);
    for (const r of res.rows) {
      expect(r.overallStatus).toBe('UNKNOWN');
      expect(r.conditions[0].metricStatus).toBe('NOT_AVAILABLE');
    }
  });

  it('validates comparison input', async () => {
    const get = (symbols: string, year: number | string = 2024) => request(http).get('/api/compare').query({ symbols, year });
    expectError((await get('FPT').expect(400)).body, 'VALIDATION_FAILED');
    expectError((await get('FPT,HPG,VNM,FPT').expect(400)).body, 'VALIDATION_FAILED');
    expectError((await get('FPT,FPT').expect(400)).body, 'VALIDATION_FAILED');
    expectError((await get('FPT,ZZZ').expect(400)).body, 'COMPANY_NOT_FOUND');
    const base = (await get('FPT,HPG', 2022).expect(200)).body as CompareResponse;
    expect(base.rows.length).toBe(8);
    for (const row of base.rows) for (const c of row.cells) expect(c).toMatchObject({ compareStatus: 'UNKNOWN', status: 'NOT_AVAILABLE', value: null });
  });

  it('lists import batches and validates batch ids', async () => {
    const batches = (await request(http).get('/api/imports').expect(200)).body as ImportBatch[];
    expect(batches.length).toBeGreaterThan(0);
    expect(batches[0].batchId).toBeGreaterThanOrEqual(batches[batches.length - 1].batchId);
    const first = batches[batches.length - 1];
    expect(Array.isArray((await request(http).get(`/api/imports/${first.batchId}/errors`).expect(200)).body)).toBe(true);
    expectError((await request(http).get('/api/imports/999999999/errors').expect(404)).body, 'BATCH_NOT_FOUND');
    expectError((await request(http).get('/api/imports/-1/errors').expect(400)).body, 'INVALID_ID');
  });

  it('answers unknown routes with the common error format', async () => {
    expectError((await request(http).get('/api/does-not-exist').expect(404)).body, 'NOT_FOUND');
  });

  it('publishes an OpenAPI document covering every endpoint', async () => {
    const doc = (await request(http).get('/api/docs-json').expect(200)).body as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/api/companies', '/api/companies/{symbol}', '/api/companies/{symbol}/market-metrics', '/api/companies/{symbol}/metrics',
      '/api/companies/{symbol}/prices', '/api/companies/{symbol}/reports', '/api/companies/{symbol}/valuation',
      '/api/compare', '/api/health', '/api/imports', '/api/imports/{batchId}/errors', '/api/market/catalog',
      '/api/metric-results/{resultId}/lineage', '/api/metrics/catalog', '/api/screening',
    ]);
  });
});

(MAIN ? describe : describe.skip)('verified pilot data (ERP_DESIGN_V1)', () => {
  it('has 3 companies with report sets 2022–2025', async () => {
    const all = (await request(http).get('/api/companies').expect(200)).body as CompanySummary[];
    expect(all.map((c) => c.symbol)).toEqual(['FPT', 'HPG', 'VNM']);
    for (const c of all) expect(c.years).toEqual([2022, 2023, 2024, 2025]);
  });

  it('returns 132 verified report lines with exactly 9 issuer corrections', async () => {
    let lines = 0;
    let corrected = 0;
    for (const symbol of ['FPT', 'HPG', 'VNM']) {
      for (const year of [2022, 2023, 2024, 2025]) {
        const r = (await request(http).get(`/api/companies/${symbol}/reports`).query({ year }).expect(200)).body as ReportLinesResponse;
        expect(r.reportSet).toMatchObject({ acceptanceStatus: 'VERIFIED', publicationStatus: 'UNKNOWN', scope: 'CONSOLIDATED' });
        expect(Object.keys(r.sources).sort()).toEqual(['BS', 'CF', 'IS']);
        for (const l of r.lines) {
          lines++;
          expect(l.lineStatus).toBe('VERIFIED');
          if (l.isCorrected) {
            corrected++;
            expect(l.correction?.page).toBeGreaterThan(0);
            expect(l.correction?.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
          } else {
            expect(l.effectiveValueVnd).toBe(l.providerValueVnd);
          }
        }
      }
    }
    expect(lines).toBe(132);
    expect(corrected).toBe(9);
  });

  it('shows the audited VNM 2025 total assets correction exactly (no float rounding)', async () => {
    const r = (await request(http).get('/api/companies/VNM/reports').query({ year: 2025 }).expect(200)).body as ReportLinesResponse;
    const assets = r.lines.find((l) => l.itemCode === 'assets');
    expect(assets).toMatchObject({ effectiveValueVnd: '53312370717301', providerValueVnd: '53312340717301', isCorrected: true });
    expect(assets?.lineName).toBe('TỔNG CỘNG TÀI SẢN');
  });

  it('returns 8 VALID metrics per company and year 2023–2025', async () => {
    for (const year of [2023, 2024, 2025]) {
      const m = (await request(http).get('/api/companies/VNM/metrics').query({ year }).expect(200)).body as MetricsResponse;
      expect(m.metrics.length).toBe(8);
      expect(m.metrics.every((x) => x.status === 'VALID' && x.value !== null && x.displayValue !== null)).toBe(true);
    }
  });

  it('traces VNM ROE 2025 to three inputs, including the corrected equity with its PDF page', async () => {
    const m = (await request(http).get('/api/companies/VNM/metrics').query({ year: 2025 }).expect(200)).body as MetricsResponse;
    const roe = m.metrics.find((x) => x.metricCode === 'ROE');
    const lin = (await request(http).get(`/api/metric-results/${roe?.resultId}/lineage`).expect(200)).body as LineageResponse;
    expect(lin.result).toMatchObject({ symbol: 'VNM', fiscalYear: 2025, metricCode: 'ROE', storedStatus: 'VALID', currentStatus: 'VALID' });
    expect(lin.formula.formulaText).toBe('NI[t]/((E[t-1]+E[t])/2)');
    expect(lin.inputs.map((i) => [i.position, i.inputYear, i.itemCode])).toEqual([[0, 2025, 'net_income'], [1, 2024, 'equity'], [2, 2025, 'equity']]);
    const equity2025 = lin.inputs[2];
    expect(equity2025.correctionKey).toBeTruthy();
    expect(equity2025.effectiveValueVnd).toBe('34483015286107');
    expect(equity2025.issuerPdfPage).toBeGreaterThan(0);
    for (const i of lin.inputs) expect(i.issuerPdfSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('screens the documented 2024 example: FPT and VNM pass, HPG fails on net margin', async () => {
    const res = (await request(http).post('/api/screening').send({
      year: 2024,
      conditions: [{ metric: 'NET_MARGIN', op: '>=', value: 0.1 }, { metric: 'CURRENT_RATIO', op: '>=', value: 1.0 }],
    }).expect(200)).body as ScreeningResponse;
    expect(res.rows.map((r) => [r.symbol, r.overallStatus])).toEqual([['FPT', 'PASS'], ['VNM', 'PASS'], ['HPG', 'FAIL']]);
    const hpg = res.rows.find((r) => r.symbol === 'HPG');
    expect(hpg?.conditions[0]).toMatchObject({ metric: 'NET_MARGIN', conditionStatus: 'FAIL', displayValue: 8.66, unit: 'PERCENT' });
  });

  it('compares three companies with 8 VALID values each for 2024', async () => {
    const c = (await request(http).get('/api/compare').query({ symbols: 'fpt,hpg,vnm', year: 2024 }).expect(200)).body as CompareResponse;
    expect(c.symbols).toEqual(['FPT', 'HPG', 'VNM']);
    expect(c.rows.length).toBe(8);
    for (const row of c.rows) expect(row.cells.map((x) => x.compareStatus)).toEqual(['VALUE', 'VALUE', 'VALUE']);
  });

  it('shows the real import batches without errors', async () => {
    const batches = (await request(http).get('/api/imports').expect(200)).body as ImportBatch[];
    const first = batches.find((b) => b.batchId === 1);
    expect(first).toMatchObject({ status: 'COMPLETED', receivedCount: 132, importedCount: 132, rejectedCount: 0, errorCount: 0 });
    expect(batches.every((b) => b.errorCount === 0)).toBe(true);
  });
});
