import { Injectable } from '@nestjs/common';
import type { DisplayUnit, LineageInput, MetricCatalogItem, MetricStatus, MetricValue } from '@erp/contracts';
import { OracleService } from '../database/oracle.service';
import { num, str } from '../common/params';

export const CURRENT_FORMULA = '1.0.0';

/** Read-only access to the metric views; lineage is always looked up by result_id (docs/11). */
@Injectable()
export class MetricsRepository {
  private readonly sqlCatalog: string;
  private readonly sqlCurrent: string;
  private readonly sqlHistoryById: string;
  private readonly sqlCurrentById: string;
  private readonly sqlLineage: string;
  private readonly compareSql = new Map<number, string>();

  constructor(private readonly oracle: OracleService) {
    const s = oracle.schema;
    this.sqlCatalog = `SELECT metric_code, formula_version, metric_name, formula_text, display_unit, input_count, requires_previous
      FROM ${s}.v_metric_catalog ORDER BY formula_version, metric_id`;
    const metricCols = `symbol, result_id, metric_code, metric_name, formula_version, metric_value, display_value, display_unit, result_status, reason_codes`;
    this.sqlCurrent = `SELECT ${metricCols} FROM ${s}.v_current_metrics
      WHERE symbol = :symbol AND fiscal_year = :year AND scope_code = 'CONSOLIDATED' AND formula_version = :formula
      ORDER BY metric_id`;
    this.sqlHistoryById = `SELECT result_id, symbol, fiscal_year, metric_code, metric_name, formula_version, metric_value, result_status, run_id
      FROM ${s}.v_metric_history WHERE result_id = :resultId`;
    this.sqlCurrentById = `SELECT result_status FROM ${s}.v_current_metrics WHERE result_id = :resultId`;
    this.sqlLineage = `SELECT input_position, year_offset, input_year, item_code, raw_name, effective_value_vnd, provider_value_vnd,
        correction_key, selected_quality, provider_sha256, provider_url, issuer_pdf_sha256, issuer_pdf_url, issuer_pdf_page
      FROM ${s}.v_metric_lineage WHERE result_id = :resultId ORDER BY input_position`;
    // Compare queries for 2 and 3 symbols: fixed text, one bind per symbol.
    for (const n of [2, 3]) {
      const binds = Array.from({ length: n }, (_, i) => `:s${i}`).join(', ');
      this.compareSql.set(n, `SELECT ${metricCols} FROM ${s}.v_current_metrics
        WHERE symbol IN (${binds}) AND fiscal_year = :year AND scope_code = 'CONSOLIDATED' AND formula_version = :formula`);
    }
  }

  async catalog(requestId: string): Promise<MetricCatalogItem[]> {
    return (await this.oracle.query(requestId, this.sqlCatalog)).map((r) => ({
      metricCode: String(r['METRIC_CODE']),
      formulaVersion: String(r['FORMULA_VERSION']),
      metricName: String(r['METRIC_NAME']),
      formulaText: String(r['FORMULA_TEXT']),
      displayUnit: String(r['DISPLAY_UNIT']) as DisplayUnit,
      inputCount: Number(r['INPUT_COUNT']),
      requiresPrevious: Number(r['REQUIRES_PREVIOUS']) === 1,
    }));
  }

  async current(requestId: string, symbol: string, year: number): Promise<MetricValue[]> {
    return (await this.oracle.query(requestId, this.sqlCurrent, { symbol, year, formula: CURRENT_FORMULA })).map(toMetric);
  }

  async compare(requestId: string, symbols: string[], year: number): Promise<Array<MetricValue & { symbol: string }>> {
    const sql = this.compareSql.get(symbols.length);
    if (!sql) throw new Error('compare supports 2 or 3 symbols');
    const binds: Record<string, string | number> = { year, formula: CURRENT_FORMULA };
    symbols.forEach((sym, i) => (binds[`s${i}`] = sym));
    return (await this.oracle.query(requestId, sql, binds)).map((r) => ({ symbol: String(r['SYMBOL']), ...toMetric(r) }));
  }

  async history(requestId: string, resultId: number) {
    const rows = await this.oracle.query(requestId, this.sqlHistoryById, { resultId });
    if (!rows.length) return null;
    const r = rows[0];
    return {
      resultId: Number(r['RESULT_ID']),
      symbol: String(r['SYMBOL']),
      fiscalYear: Number(r['FISCAL_YEAR']),
      metricCode: String(r['METRIC_CODE']),
      metricName: String(r['METRIC_NAME']),
      formulaVersion: String(r['FORMULA_VERSION']),
      value: num(r['METRIC_VALUE']),
      storedStatus: String(r['RESULT_STATUS']) as MetricStatus,
      runId: Number(r['RUN_ID']),
    };
  }

  async currentStatus(requestId: string, resultId: number): Promise<MetricStatus | null> {
    const rows = await this.oracle.query(requestId, this.sqlCurrentById, { resultId });
    return rows.length ? (String(rows[0]['RESULT_STATUS']) as MetricStatus) : null;
  }

  async lineage(requestId: string, resultId: number): Promise<LineageInput[]> {
    const rows = await this.oracle.query(requestId, this.sqlLineage, { resultId }, { asString: ['EFFECTIVE_VALUE_VND', 'PROVIDER_VALUE_VND'] });
    return rows.map((r) => ({
      position: Number(r['INPUT_POSITION']),
      yearOffset: Number(r['YEAR_OFFSET']),
      inputYear: Number(r['INPUT_YEAR']),
      itemCode: String(r['ITEM_CODE']),
      lineName: str(r['RAW_NAME']),
      effectiveValueVnd: str(r['EFFECTIVE_VALUE_VND']),
      providerValueVnd: str(r['PROVIDER_VALUE_VND']),
      correctionKey: str(r['CORRECTION_KEY']),
      selectedQuality: String(r['SELECTED_QUALITY']),
      providerSha256: str(r['PROVIDER_SHA256']),
      providerUrl: str(r['PROVIDER_URL']),
      issuerPdfSha256: str(r['ISSUER_PDF_SHA256']),
      issuerPdfUrl: str(r['ISSUER_PDF_URL']),
      issuerPdfPage: num(r['ISSUER_PDF_PAGE']),
    }));
  }
}

function toMetric(r: Record<string, unknown>): MetricValue {
  return {
    resultId: Number(r['RESULT_ID']),
    metricCode: String(r['METRIC_CODE']),
    metricName: String(r['METRIC_NAME']),
    formulaVersion: String(r['FORMULA_VERSION']),
    value: num(r['METRIC_VALUE']),
    displayValue: num(r['DISPLAY_VALUE']),
    displayUnit: String(r['DISPLAY_UNIT']) as DisplayUnit,
    status: String(r['RESULT_STATUS']) as MetricStatus,
    reasonCodes: str(r['REASON_CODES']),
  };
}
