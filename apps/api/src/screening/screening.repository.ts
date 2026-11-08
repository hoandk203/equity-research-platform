import { Injectable } from '@nestjs/common';
import type { ScreeningCondition, ScreeningConditionResult, ScreeningRow } from '@erp/contracts';
import { OracleService } from '../database/oracle.service';

/** Calls pkg_screening.screen (sql/018). Conditions travel as one JSON bind value. */
@Injectable()
export class ScreeningRepository {
  private readonly sqlScreen: string;

  constructor(private readonly oracle: OracleService) {
    this.sqlScreen = `SELECT symbol, company_name, overall_status, passed_count, failed_count, unknown_count, details
      FROM TABLE(${oracle.schema}.pkg_screening.screen(:year, :conditions))
      ORDER BY CASE overall_status WHEN 'PASS' THEN 1 WHEN 'UNKNOWN' THEN 2 ELSE 3 END, symbol`;
  }

  async screen(requestId: string, year: number, conditions: ScreeningCondition[]): Promise<ScreeningRow[]> {
    const payload = JSON.stringify(conditions.map(({ metric, op, value }) => ({ metric, op, value })));
    const rows = await this.oracle.query(requestId, this.sqlScreen, { year, conditions: payload });
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
            displayValue: d['display_value'] == null ? null : Number(d['display_value']),
            unit: (d['unit'] as ScreeningConditionResult['unit']) ?? null,
            metricStatus: d['metric_status'] as ScreeningConditionResult['metricStatus'],
            conditionStatus: d['condition_status'] as ScreeningConditionResult['conditionStatus'],
          }),
        ),
      };
    });
  }
}
