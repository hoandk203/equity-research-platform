import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MAX_PRICE_BARS,
  type CompareMarketRow, type MarketMetricCatalogItem, type MarketSnapshot, type PriceBasis, type PriceInterval,
  type PriceSeriesResponse, type ValuationResponse,
} from '@erp/contracts';
import { CompaniesService } from '../companies/companies.service';
import { MarketRepository } from './market.repository';

/** A YYYY-MM-DD string that is a real calendar date. */
export function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function requireDate(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isCalendarDate(value)) throw new BadRequestException({ code: 'INVALID_DATE', message: `${name} phải là ngày hợp lệ dạng YYYY-MM-DD.` });
  return value;
}

const MARKET_FIELD: Record<string, keyof MarketSnapshot> = {
  CLOSE_PRICE: 'close', RETURN_1M: 'return1m', RETURN_3M: 'return3m', RETURN_6M: 'return6m', RETURN_1Y: 'return1y',
  VOLATILITY_1Y: 'volatility1y', MA20: 'ma20', MA50: 'ma50', MA200: 'ma200', HIGH_52W: 'high52w', LOW_52W: 'low52w',
  DIST_52W_HIGH: 'dist52wHigh',
};

@Injectable()
export class MarketService {
  constructor(private readonly repo: MarketRepository, private readonly companies: CompaniesService) {}

  /** Requested date, or the latest session in the database. */
  async asOf(requestId: string, date?: string): Promise<string> {
    return requireDate(date, 'date') ?? (await this.repo.latestDate(requestId)) ?? new Date().toISOString().slice(0, 10);
  }

  async prices(requestId: string, symbol: string, q: { from?: string; to?: string; basis?: PriceBasis; interval?: PriceInterval }): Promise<PriceSeriesResponse> {
    await this.companies.requireCompany(requestId, symbol);
    const from = requireDate(q.from, 'from');
    const to = requireDate(q.to, 'to');
    if (from && to && from > to) throw new BadRequestException({ code: 'INVALID_RANGE', message: 'from phải trước hoặc bằng to.' });
    const basis = q.basis ?? 'ADJUSTED';
    const interval = q.interval ?? 'day';
    const range = await this.repo.range(requestId, symbol);
    const fromDate = from ?? range.first ?? '1900-01-01';
    const toDate = to ?? range.last ?? '2200-12-31';
    const [bars, corrections] = await Promise.all([
      this.repo.bars(requestId, symbol, basis, interval, fromDate, toDate),
      this.repo.corrections(requestId, symbol, fromDate, toDate),
    ]);
    if (bars.length > MAX_PRICE_BARS) {
      throw new BadRequestException({ code: 'RANGE_TOO_LARGE', message: `Khoảng thời gian vượt ${MAX_PRICE_BARS} phiên; dùng interval=month.` });
    }
    return {
      symbol, basis, interval, from: from ?? null, to: to ?? null, firstAvailable: range.first, lastAvailable: range.last,
      bars, source: range.source, corrections: corrections.filter((c) => c.basis === basis),
    };
  }

  async snapshot(requestId: string, symbol: string, date?: string): Promise<MarketSnapshot> {
    await this.companies.requireCompany(requestId, symbol);
    return this.repo.snapshot(requestId, symbol, await this.asOf(requestId, date));
  }

  async valuation(requestId: string, symbol: string, date?: string): Promise<ValuationResponse> {
    await this.companies.requireCompany(requestId, symbol);
    return this.repo.valuation(requestId, symbol, await this.asOf(requestId, date));
  }

  catalog(requestId: string): Promise<MarketMetricCatalogItem[]> {
    return this.repo.catalog(requestId);
  }

  /** Valuation and market rows for the compare screen (companies are already validated). */
  async compareRows(requestId: string, symbols: string[], asOf: string): Promise<CompareMarketRow[]> {
    const [catalog, snaps, vals] = await Promise.all([
      this.repo.catalog(requestId),
      Promise.all(symbols.map((s) => this.repo.snapshot(requestId, s, asOf))),
      Promise.all(symbols.map((s) => this.repo.valuation(requestId, s, asOf))),
    ]);
    return catalog.map((m) => ({
      metricCode: m.metricCode, metricName: m.metricName, metricGroup: m.metricGroup, displayUnit: m.displayUnit,
      cells: symbols.map((symbol, i) => {
        const snap = snaps[i];
        const val = vals[i];
        if (m.metricGroup === 'MARKET') {
          const v = snap.tradingDate ? (snap[MARKET_FIELD[m.metricCode]] as number | null) : null;
          return { symbol, value: v, status: !snap.tradingDate ? 'NO_PRICE' : v === null ? 'INSUFFICIENT_HISTORY' : 'VALID', tradingDate: snap.tradingDate };
        }
        const value = { MARKET_CAP: val.marketCap === null ? null : Number(val.marketCap), PE: val.pe, PB: val.pb, EPS: val.eps, BVPS: val.bvps }[m.metricCode] ?? null;
        const status = { MARKET_CAP: val.marketCapStatus, PE: val.peStatus, PB: val.pbStatus,
          EPS: val.peStatus === 'NEGATIVE_EARNINGS' ? 'VALID' : val.peStatus, BVPS: val.pbStatus === 'NEGATIVE_BOOK' ? 'VALID' : val.pbStatus }[m.metricCode] ?? 'NO_PRICE';
        return { symbol, value, status, tradingDate: val.tradingDate };
      }),
    }));
  }
}
