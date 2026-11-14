import { Injectable } from '@nestjs/common';
import type { ScreeningCondition, ScreeningConditionResult, ScreeningRow } from '@erp/contracts';
import { OracleService } from '../database/oracle.service';
import { num, toDateOnly } from '../common/params';

/**
 * Calls pkg_screening.screen (sql/018, by fiscal year) and pkg_screening.screen_at (sql/023, by
 * date with valuation and market metrics). Conditions travel as one JSON bind value.
 */
@Injectable()
export class ScreeningRepository {
  private readonly sqlScreen: string;
  private readonly sqlScreenAt: string;

  constructor(private readonly oracle: OracleService) {
    const order = `ORDER BY CASE overall_status WHEN 'PASS' THEN 1 WHEN 'UNKNOWN' THEN 2 ELSE 3 END, symbol`;
    this.sqlScreen = `SELECT symbol, company_name, overall_status, passed_count, failed_count, unknown_count, details,
        NULL trading_date, NULL report_year
      FROM TABLE(${oracle.schema}.pkg_screening.screen(:year, :conditions)) ${order}`;
    this.sqlScreenAt = `SELECT symbol, company_name, overall_status, passed_count, failed_count, unknown_count, details,
        trading_date, report_year
      FROM TABLE(${oracle.schema}.pkg_screening.screen_at(TO_DATE(:asOf, 'YYYY-MM-DD'), :conditions)) ${order}`;
  }

  screen(requestId: string, year: number, conditions: ScreeningCondition[]): Promise<ScreeningRow[]> {
    return this.run(requestId, this.sqlScreen, { year }, conditions);
  }

  screenAt(requestId: string, asOf: string, conditions: ScreeningCondition[]): Promise<ScreeningRow[]> {
    return this.run(requestId, this.sqlScreenAt, { asOf }, conditions);
  }

  private async run(requestId: string, sql: string, binds: Record<string, string | number>, conditions: ScreeningCondition[]): Promise<ScreeningRow[]> {
    const payload = JSON.stringify(conditions.map(({ metric, op, value }) => ({ metric, op, value })));
    const rows = await this.oracle.query(requestId, sql, { ...binds, conditions: payload });
    return rows.map((r) => {
      const details = JSON.parse(String(r['DETAILS'] ?? '[]')) as Array<Record<string, unknown>>;
      return {
        symbol: String(r['SYMBOL']),
        companyName: String(r['COMPANY_NAME']),
        overallStatus: String(r['OVERALL_STATUS']) as ScreeningRow['overallStatus'],
        passedCount: Number(r['PASSED_COUNT']),
        failedCount: Number(r['FAILED_COUNT']),
        unknownCount: Number(r['UNKNOWN_COUNT']),
        conditions: details.map(
          (d): ScreeningConditionResult => ({
            metric: String(d['metric']),
            op: d['op'] as ScreeningConditionResult['op'],
            threshold: Number(d['threshold']),
            value: d['value'] == null ? null : Number(d['value']),
            // screen() returns display_value; screen_at() leaves formatting to the unit (percent points for PERCENT).
            displayValue: d['display_value'] != null ? Number(d['display_value'])
              : d['value'] == null ? null
              : d['unit'] === 'PERCENT' ? Math.round(Number(d['value']) * 10000) / 100 : Number(d['value']),
            unit: (d['unit'] as ScreeningConditionResult['unit']) ?? null,
            metricStatus: d['metric_status'] as ScreeningConditionResult['metricStatus'],
            conditionStatus: d['condition_status'] as ScreeningConditionResult['conditionStatus'],
            group: (d['group'] as ScreeningConditionResult['group']) ?? 'FINANCIAL',
          }),
        ),
        tradingDate: toDateOnly(r['TRADING_DATE']),
        reportYear: num(r['REPORT_YEAR']),
      };
    });
  }
}
