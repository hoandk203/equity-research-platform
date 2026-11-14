import { Injectable } from '@nestjs/common';
import type {
  MarketMetricCatalogItem, MarketSnapshot, MarketUnit, PriceBar, PriceBasis, PriceCorrectionInfo,
  ValuationResponse, ValuationStatus,
} from '@erp/contracts';
import { MAX_PRICE_BARS } from '@erp/contracts';
import { OracleService } from '../database/oracle.service';
import { num, str, toDateOnly } from '../common/params';

/** Money totals and share counts are fetched as strings (exact, like the financial API). */
const MONEY = ['MARKET_CAP', 'SHARES_OUTSTANDING', 'PARENT_NET_INCOME', 'EQUITY', 'NON_CONTROLLING_INTEREST', 'PARENT_EQUITY'];

/** Read-only access to the market views of sql/022 (prices, metrics, valuation, catalog). */
@Injectable()
export class MarketRepository {
  private readonly sqlLatest: string;
  private readonly sqlRange: string;
  private readonly sqlDaily: string;
  private readonly sqlMonthly: Record<PriceBasis, string>;
  private readonly sqlCorrections: string;
  private readonly sqlSnapshot: string;
  private readonly sqlValuation: string;
  private readonly sqlCatalog: string;

  constructor(private readonly oracle: OracleService) {
    const s = oracle.schema;
    this.sqlLatest = `SELECT MAX(trading_date) last_date FROM ${s}.v_market_metrics_daily`;
    this.sqlRange = `SELECT MIN(trading_date) first_date, MAX(trading_date) last_date, MAX(source_code) source_code,
        MAX(source_sha256) source_sha256, MAX(source_url) source_url, MAX(batch_id) batch_id
      FROM ${s}.v_price_history WHERE symbol = :symbol AND price_basis = 'UNADJUSTED'`;
    this.sqlDaily = `SELECT trading_date bar_date, open_vnd, high_vnd, low_vnd, close_vnd, volume, is_corrected
      FROM ${s}.v_price_history
      WHERE symbol = :symbol AND price_basis = :basis
        AND trading_date BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')
      ORDER BY trading_date FETCH FIRST ${MAX_PRICE_BARS + 1} ROWS ONLY`;
    const monthly = (o: string, h: string, l: string, c: string) => `SELECT month_start bar_date, ${o} open_vnd, ${h} high_vnd,
        ${l} low_vnd, ${c} close_vnd, volume, 0 is_corrected
      FROM ${s}.v_price_monthly
      WHERE symbol = :symbol AND last_session >= TO_DATE(:fromDate, 'YYYY-MM-DD') AND first_session <= TO_DATE(:toDate, 'YYYY-MM-DD')
      ORDER BY month_start FETCH FIRST ${MAX_PRICE_BARS + 1} ROWS ONLY`;
    this.sqlMonthly = {
      ADJUSTED: monthly('adj_open', 'adj_high', 'adj_low', 'adj_close'),
      UNADJUSTED: monthly('open_vnd', 'high_vnd', 'low_vnd', 'close_vnd'),
    };
    this.sqlCorrections = `SELECT trading_date, price_basis, field_name, provider_value, accepted_value, reason, evidence
      FROM ${s}.v_price_corrections
      WHERE symbol = :symbol AND trading_date BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')
      ORDER BY trading_date, price_basis, field_name`;
    const latestOnOrBefore = (view: string) => `trading_date = (SELECT MAX(trading_date) FROM ${s}.${view}
        WHERE symbol = :symbol AND trading_date <= TO_DATE(:asOf, 'YYYY-MM-DD'))`;
    this.sqlSnapshot = `SELECT symbol, trading_date, session_no, close_vnd, prev_close_vnd, adj_close, ret_1d, volume,
        ret_1m, ret_3m, ret_6m, ret_1y, volatility_1y, ma20, ma50, ma200, high_52w, low_52w, dist_52w_high
      FROM ${s}.v_market_metrics_daily WHERE symbol = :symbol AND ${latestOnOrBefore('v_market_metrics_daily')}`;
    this.sqlValuation = `SELECT v.trading_date, v.close_vnd, v.policy_code, v.report_year, v.shares_outstanding, v.shares_effective_date,
        v.shares_check, v.market_cap, v.eps, v.pe, v.bvps, v.pb, v.market_cap_status, v.pe_status, v.pb_status,
        v.parent_net_income, v.equity, v.non_controlling_interest, v.parent_equity, v.input_status,
        i.nci_evidence_page, i.nci_corrected
      FROM ${s}.v_valuation_daily v
      LEFT JOIN ${s}.v_valuation_inputs i ON i.company_id = v.company_id AND i.fiscal_year = v.report_year
      WHERE v.symbol = :symbol AND v.${latestOnOrBefore('v_valuation_daily')}`;
    this.sqlCatalog = `SELECT metric_code, metric_group, metric_name, display_unit, formula_text, formula_version
      FROM ${s}.v_market_metric_catalog ORDER BY sort_order`;
  }

  /** Latest session in the database (default "as of" date). */
  async latestDate(requestId: string): Promise<string | null> {
    const [r] = await this.oracle.query(requestId, this.sqlLatest);
    return toDateOnly(r?.['LAST_DATE']);
  }

  async range(requestId: string, symbol: string) {
    const [r] = await this.oracle.query(requestId, this.sqlRange, { symbol });
    return {
      first: toDateOnly(r?.['FIRST_DATE']),
      last: toDateOnly(r?.['LAST_DATE']),
      source: r?.['SOURCE_CODE'] == null ? null : {
        code: String(r['SOURCE_CODE']), sha256: String(r['SOURCE_SHA256']), url: str(r['SOURCE_URL']), batchId: Number(r['BATCH_ID']),
      },
    };
  }

  async bars(requestId: string, symbol: string, basis: PriceBasis, interval: 'day' | 'month', fromDate: string, toDate: string): Promise<PriceBar[]> {
    const sql = interval === 'day' ? this.sqlDaily : this.sqlMonthly[basis];
    const binds = interval === 'day' ? { symbol, basis, fromDate, toDate } : { symbol, fromDate, toDate };
    return (await this.oracle.query(requestId, sql, binds)).map((r) => ({
      date: toDateOnly(r['BAR_DATE']) ?? '',
      open: num(r['OPEN_VND']), high: num(r['HIGH_VND']), low: num(r['LOW_VND']), close: Number(r['CLOSE_VND']),
      volume: num(r['VOLUME']), corrected: Number(r['IS_CORRECTED']) === 1,
    }));
  }

  async corrections(requestId: string, symbol: string, fromDate: string, toDate: string): Promise<PriceCorrectionInfo[]> {
    return (await this.oracle.query(requestId, this.sqlCorrections, { symbol, fromDate, toDate })).map((r) => ({
      date: toDateOnly(r['TRADING_DATE']) ?? '',
      basis: String(r['PRICE_BASIS']) as PriceBasis,
      field: String(r['FIELD_NAME']),
      providerValue: Number(r['PROVIDER_VALUE']),
      acceptedValue: Number(r['ACCEPTED_VALUE']),
      reason: String(r['REASON']),
      evidence: String(r['EVIDENCE']),
    }));
  }

  async snapshot(requestId: string, symbol: string, asOf: string): Promise<MarketSnapshot> {
    const [r] = await this.oracle.query(requestId, this.sqlSnapshot, { symbol, asOf });
    const n = (k: string) => (r ? num(r[k]) : null);
    return {
      symbol, asOf, tradingDate: r ? toDateOnly(r['TRADING_DATE']) : null, sessionNo: n('SESSION_NO'),
      close: n('CLOSE_VND'), prevClose: n('PREV_CLOSE_VND'), adjClose: n('ADJ_CLOSE'), change1d: n('RET_1D'), volume: n('VOLUME'),
      return1m: n('RET_1M'), return3m: n('RET_3M'), return6m: n('RET_6M'), return1y: n('RET_1Y'), volatility1y: n('VOLATILITY_1Y'),
      ma20: n('MA20'), ma50: n('MA50'), ma200: n('MA200'), high52w: n('HIGH_52W'), low52w: n('LOW_52W'), dist52wHigh: n('DIST_52W_HIGH'),
    };
  }

  async valuation(requestId: string, symbol: string, asOf: string): Promise<ValuationResponse> {
    const [r] = await this.oracle.query(requestId, this.sqlValuation, { symbol, asOf }, { asString: MONEY });
    if (!r) {
      return {
        symbol, asOf, tradingDate: null, policyCode: null, reportYear: null, retrospective: true, close: null,
        sharesOutstanding: null, sharesEffectiveDate: null, sharesCheck: null, marketCap: null, eps: null, pe: null, bvps: null, pb: null,
        marketCapStatus: 'NO_PRICE', peStatus: 'NO_PRICE', pbStatus: 'NO_PRICE',
        inputs: { fiscalYear: null, parentNetIncome: null, equity: null, nonControllingInterest: null, parentEquity: null,
          inputStatus: null, nciEvidencePage: null, nciCorrected: false },
      };
    }
    return {
      symbol, asOf, tradingDate: toDateOnly(r['TRADING_DATE']), policyCode: str(r['POLICY_CODE']), reportYear: num(r['REPORT_YEAR']),
      retrospective: true, close: num(r['CLOSE_VND']),
      sharesOutstanding: str(r['SHARES_OUTSTANDING']), sharesEffectiveDate: toDateOnly(r['SHARES_EFFECTIVE_DATE']), sharesCheck: str(r['SHARES_CHECK']),
      marketCap: str(r['MARKET_CAP']), eps: num(r['EPS']), pe: num(r['PE']), bvps: num(r['BVPS']), pb: num(r['PB']),
      marketCapStatus: String(r['MARKET_CAP_STATUS']) as ValuationStatus,
      peStatus: String(r['PE_STATUS']) as ValuationStatus,
      pbStatus: String(r['PB_STATUS']) as ValuationStatus,
      inputs: {
        fiscalYear: num(r['REPORT_YEAR']), parentNetIncome: str(r['PARENT_NET_INCOME']), equity: str(r['EQUITY']),
        nonControllingInterest: str(r['NON_CONTROLLING_INTEREST']), parentEquity: str(r['PARENT_EQUITY']),
        inputStatus: str(r['INPUT_STATUS']), nciEvidencePage: num(r['NCI_EVIDENCE_PAGE']), nciCorrected: Number(r['NCI_CORRECTED']) === 1,
      },
    };
  }

  async catalog(requestId: string): Promise<MarketMetricCatalogItem[]> {
    return (await this.oracle.query(requestId, this.sqlCatalog)).map((r) => ({
      metricCode: String(r['METRIC_CODE']),
      metricGroup: String(r['METRIC_GROUP']) as MarketMetricCatalogItem['metricGroup'],
      metricName: String(r['METRIC_NAME']),
      displayUnit: String(r['DISPLAY_UNIT']) as MarketUnit,
      formulaText: String(r['FORMULA_TEXT']),
      formulaVersion: String(r['FORMULA_VERSION']),
    }));
  }
}
