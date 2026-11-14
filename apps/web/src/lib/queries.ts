'use client';
import { useQuery } from '@tanstack/react-query';
import type {
  CompanyDetail, CompanySummary, CompareResponse, ImportBatch, ImportError, LineageResponse, MarketMetricCatalogItem,
  MarketSnapshot, MetricCatalogItem, MetricsResponse, PriceBasis, PriceSeriesResponse, ReportLinesResponse,
  ScreeningCondition, ScreeningResponse, ValuationResponse,
} from '@erp/contracts';
import { apiGet, apiPost } from './api';

/** Server state lives in React Query only (docs/14 §2): one hook per API endpoint. */
export const queryKeys = {
  companies: (q: string) => ['companies', q] as const,
  company: (symbol: string) => ['company', symbol] as const,
  reports: (symbol: string, year: number) => ['reports', symbol, year] as const,
  metrics: (symbol: string, year: number) => ['metrics', symbol, year] as const,
  lineage: (resultId: number) => ['lineage', resultId] as const,
  catalog: () => ['catalog'] as const,
  screening: (mode: ScreeningMode | null, conditions: ScreeningCondition[]) => ['screening', mode, conditions] as const,
  compare: (symbols: string[], year: number, date: string | null) => ['compare', symbols.join(','), year, date] as const,
  prices: (symbol: string, basis: PriceBasis) => ['prices', symbol, basis] as const,
  snapshot: (symbol: string, date: string | null) => ['market-snapshot', symbol, date] as const,
  valuation: (symbol: string, date: string | null) => ['valuation', symbol, date] as const,
  marketCatalog: () => ['market-catalog'] as const,
  imports: () => ['imports'] as const,
  importErrors: (batchId: number) => ['import-errors', batchId] as const,
};

export const useCompanies = (q: string) =>
  useQuery({ queryKey: queryKeys.companies(q), queryFn: () => apiGet<CompanySummary[]>('/companies', { q }) });

export const useCompany = (symbol: string) =>
  useQuery({ queryKey: queryKeys.company(symbol), queryFn: () => apiGet<CompanyDetail>(`/companies/${encodeURIComponent(symbol)}`), enabled: !!symbol });

export const useReportLines = (symbol: string, year: number) =>
  useQuery({ queryKey: queryKeys.reports(symbol, year), queryFn: () => apiGet<ReportLinesResponse>(`/companies/${encodeURIComponent(symbol)}/reports`, { year }) });

export const useMetrics = (symbol: string, year: number) =>
  useQuery({ queryKey: queryKeys.metrics(symbol, year), queryFn: () => apiGet<MetricsResponse>(`/companies/${encodeURIComponent(symbol)}/metrics`, { year }) });

export const useLineage = (resultId: number | null) =>
  useQuery({
    queryKey: queryKeys.lineage(resultId ?? 0),
    queryFn: () => apiGet<LineageResponse>(`/metric-results/${resultId}/lineage`),
    enabled: resultId !== null && resultId > 0,
  });

export const useCatalog = () =>
  useQuery({ queryKey: queryKeys.catalog(), queryFn: () => apiGet<MetricCatalogItem[]>('/metrics/catalog'), staleTime: Infinity });

/** Year mode (financial metrics of one fiscal year) or date mode (financial + valuation + market). */
export type ScreeningMode = { year: number } | { date: string };

/** Screening is a read (POST only because conditions are a structured body). */
export const useScreening = (mode: ScreeningMode | null, conditions: ScreeningCondition[] | null) =>
  useQuery({
    queryKey: queryKeys.screening(mode, conditions ?? []),
    queryFn: () => apiPost<ScreeningResponse>('/screening', { ...mode, conditions }),
    enabled: mode !== null && !!conditions?.length,
    retry: false,
  });

export const useCompare = (symbols: string[], year: number, date: string | null = null) =>
  useQuery({
    queryKey: queryKeys.compare(symbols, year, date),
    queryFn: () => apiGet<CompareResponse>('/compare', { symbols: symbols.join(','), year, date }),
    enabled: symbols.length >= 2 && symbols.length <= 3,
    retry: false,
  });

/** Full daily series of one basis (the chart zooms client-side, MAs need the full history). */
export const usePrices = (symbol: string, basis: PriceBasis) =>
  useQuery({
    queryKey: queryKeys.prices(symbol, basis),
    queryFn: () => apiGet<PriceSeriesResponse>(`/companies/${encodeURIComponent(symbol)}/prices`, { basis }),
    staleTime: 5 * 60_000,
  });

export const useMarketSnapshot = (symbol: string, date: string | null = null) =>
  useQuery({
    queryKey: queryKeys.snapshot(symbol, date),
    queryFn: () => apiGet<MarketSnapshot>(`/companies/${encodeURIComponent(symbol)}/market-metrics`, { date }),
  });

export const useValuation = (symbol: string, date: string | null = null) =>
  useQuery({
    queryKey: queryKeys.valuation(symbol, date),
    queryFn: () => apiGet<ValuationResponse>(`/companies/${encodeURIComponent(symbol)}/valuation`, { date }),
  });

export const useMarketCatalog = () =>
  useQuery({ queryKey: queryKeys.marketCatalog(), queryFn: () => apiGet<MarketMetricCatalogItem[]>('/market/catalog'), staleTime: Infinity });

export const useImports = () => useQuery({ queryKey: queryKeys.imports(), queryFn: () => apiGet<ImportBatch[]>('/imports') });

export const useImportErrors = (batchId: number | null) =>
  useQuery({
    queryKey: queryKeys.importErrors(batchId ?? 0),
    queryFn: () => apiGet<ImportError[]>(`/imports/${batchId}/errors`),
    enabled: batchId !== null && batchId > 0,
  });
