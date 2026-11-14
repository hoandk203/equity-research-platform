import { Injectable } from '@nestjs/common';
import type { CompanyQuote, ReportSetInfo } from '@erp/contracts';
import { OracleService } from '../database/oracle.service';
import { num, str, toDateOnly } from '../common/params';

export interface DirectoryRow {
  symbol: string;
  companyName: string;
  exchange: string;
}

/** Read-only access to v_company_directory and v_current_report_sets. */
@Injectable()
export class CompaniesRepository {
  private readonly sqlDirectory: string;
  private readonly sqlOne: string;
  private readonly sqlSets: string;
  private readonly sqlSetsOfOne: string;
  private readonly sqlQuotes: string;

  constructor(private readonly oracle: OracleService) {
    const s = oracle.schema;
    this.sqlDirectory = `SELECT symbol, company_name, exchange_code FROM ${s}.v_company_directory WHERE symbol IS NOT NULL ORDER BY symbol`;
    this.sqlOne = `SELECT symbol, company_name, exchange_code FROM ${s}.v_company_directory WHERE symbol = :symbol`;
    const setCols = `symbol, fiscal_year, scope_code, report_set_id, selection_version, dataset_version, acceptance_status, publication_status`;
    this.sqlSets = `SELECT ${setCols} FROM ${s}.v_current_report_sets ORDER BY symbol, fiscal_year`;
    this.sqlSetsOfOne = `SELECT ${setCols} FROM ${s}.v_current_report_sets WHERE symbol = :symbol ORDER BY fiscal_year`;
    // Latest session per company (sql/022): close, adjusted daily change, market cap (exact string).
    this.sqlQuotes = `SELECT m.symbol, m.trading_date, m.close_vnd, m.ret_1d, v.market_cap
      FROM ${s}.v_market_metrics_daily m
      LEFT JOIN ${s}.v_valuation_daily v ON v.symbol = m.symbol AND v.trading_date = m.trading_date
      WHERE (m.symbol, m.trading_date) IN (SELECT symbol, MAX(trading_date) FROM ${s}.v_market_metrics_daily GROUP BY symbol)`;
  }

  async quotes(requestId: string): Promise<Map<string, CompanyQuote>> {
    const rows = await this.oracle.query(requestId, this.sqlQuotes, {}, { asString: ['MARKET_CAP'] });
    return new Map(rows.map((r) => [String(r['SYMBOL']), {
      tradingDate: toDateOnly(r['TRADING_DATE']) ?? '', close: Number(r['CLOSE_VND']), change1d: num(r['RET_1D']), marketCap: str(r['MARKET_CAP']),
    }]));
  }

  async directory(requestId: string): Promise<DirectoryRow[]> {
    return (await this.oracle.query(requestId, this.sqlDirectory)).map(toDirectory);
  }

  async findOne(requestId: string, symbol: string): Promise<DirectoryRow | null> {
    const rows = await this.oracle.query(requestId, this.sqlOne, { symbol });
    return rows.length ? toDirectory(rows[0]) : null;
  }

  async reportSets(requestId: string, symbol?: string): Promise<Array<ReportSetInfo & { symbol: string }>> {
    const rows = symbol
      ? await this.oracle.query(requestId, this.sqlSetsOfOne, { symbol })
      : await this.oracle.query(requestId, this.sqlSets);
    return rows.map((r) => ({ symbol: String(r['SYMBOL']), ...toReportSet(r) }));
  }
}

function toDirectory(r: Record<string, unknown>): DirectoryRow {
  return { symbol: String(r['SYMBOL']), companyName: String(r['COMPANY_NAME']), exchange: String(r['EXCHANGE_CODE']) };
}

export function toReportSet(r: Record<string, unknown>): ReportSetInfo {
  return {
    fiscalYear: Number(r['FISCAL_YEAR']),
    scope: String(r['SCOPE_CODE']),
    reportSetId: Number(r['REPORT_SET_ID']),
    selectionVersion: num(r['SELECTION_VERSION']) ?? 0,
    datasetVersion: str(r['DATASET_VERSION']) ?? '',
    acceptanceStatus: String(r['ACCEPTANCE_STATUS']),
    publicationStatus: r['PUBLICATION_STATUS'] === 'KNOWN' ? 'KNOWN' : 'UNKNOWN',
  };
}
