import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CompareResponse, LineageResponse, MetricCatalogItem, MetricsResponse } from '@erp/contracts';
import { CompaniesService } from '../companies/companies.service';
import { MarketService } from '../market/market.service';
import { CURRENT_FORMULA, MetricsRepository } from './metrics.repository';

@Injectable()
export class MetricsService {
  constructor(
    private readonly repo: MetricsRepository,
    private readonly companies: CompaniesService,
    private readonly market: MarketService,
  ) {}

  catalog(requestId: string): Promise<MetricCatalogItem[]> {
    return this.repo.catalog(requestId);
  }

  async currentCatalog(requestId: string): Promise<MetricCatalogItem[]> {
    return (await this.repo.catalog(requestId)).filter((m) => m.formulaVersion === CURRENT_FORMULA);
  }

  async metrics(requestId: string, symbol: string, year: number): Promise<MetricsResponse> {
    await this.companies.requireCompany(requestId, symbol);
    return { symbol, year, metrics: await this.repo.current(requestId, symbol, year) };
  }

  async lineage(requestId: string, resultId: number): Promise<LineageResponse> {
    const result = await this.repo.history(requestId, resultId);
    if (!result) throw new NotFoundException({ code: 'RESULT_NOT_FOUND', message: `Không tìm thấy kết quả chỉ số ${resultId}.` });
    const [currentStatus, inputs, catalog] = await Promise.all([
      this.repo.currentStatus(requestId, resultId),
      this.repo.lineage(requestId, resultId),
      this.repo.catalog(requestId),
    ]);
    const formula = catalog.find((c) => c.metricCode === result.metricCode && c.formulaVersion === result.formulaVersion);
    if (!formula) throw new Error(`Catalog has no formula for ${result.metricCode} ${result.formulaVersion}`);
    const { formulaVersion: _fv, ...header } = result;
    return { result: { ...header, currentStatus }, formula, inputs };
  }

  /** Same year and formula for every company; a missing or non-VALID value is UNKNOWN (no fallback). */
  async compare(requestId: string, symbols: string[], year: number, date?: string): Promise<CompareResponse> {
    const missing: string[] = [];
    for (const s of symbols) {
      try {
        await this.companies.requireCompany(requestId, s);
      } catch {
        missing.push(s);
      }
    }
    if (missing.length) {
      throw new BadRequestException({ code: 'COMPANY_NOT_FOUND', message: `Không tìm thấy doanh nghiệp: ${missing.join(', ')}.` });
    }
    const asOf = await this.market.asOf(requestId, date);
    const [catalog, values, marketRows] = await Promise.all([
      this.currentCatalog(requestId),
      this.repo.compare(requestId, symbols, year),
      this.market.compareRows(requestId, symbols, asOf),
    ]);
    return {
      year,
      symbols,
      date: asOf,
      marketRows,
      rows: catalog.map((m) => ({
        metricCode: m.metricCode,
        metricName: m.metricName,
        displayUnit: m.displayUnit,
        cells: symbols.map((symbol) => {
          const v = values.find((x) => x.symbol === symbol && x.metricCode === m.metricCode);
          const ok = !!v && v.status === 'VALID' && v.value !== null;
          return {
            symbol,
            value: ok ? v.value : null,
            displayValue: ok ? v.displayValue : null,
            status: v ? v.status : 'NOT_AVAILABLE',
            compareStatus: ok ? 'VALUE' : 'UNKNOWN',
          };
        }),
      })),
    };
  }
}
