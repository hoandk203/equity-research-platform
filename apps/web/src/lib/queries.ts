'use client';
import { useQuery } from '@tanstack/react-query';
import type {
  CompanyDetail, CompanySummary, CompareResponse, ImportBatch, ImportError, LineageResponse,
  MetricCatalogItem, MetricsResponse, ReportLinesResponse, ScreeningCondition, ScreeningResponse,
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
  screening: (year: number, conditions: ScreeningCondition[]) => ['screening', year, conditions] as const,
  compare: (symbols: string[], year: number) => ['compare', symbols.join(','), year] as const,
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

/** Screening is a read (POST only because conditions are a structured body). */
export const useScreening = (year: number | null, conditions: ScreeningCondition[] | null) =>
  useQuery({
    queryKey: queryKeys.screening(year ?? 0, conditions ?? []),
    queryFn: () => apiPost<ScreeningResponse>('/screening', { year, conditions }),
    enabled: year !== null && !!conditions?.length,
    retry: false,
  });

export const useCompare = (symbols: string[], year: number) =>
  useQuery({
    queryKey: queryKeys.compare(symbols, year),
    queryFn: () => apiGet<CompareResponse>('/compare', { symbols: symbols.join(','), year }),
    enabled: symbols.length >= 2 && symbols.length <= 3,
    retry: false,
  });

export const useImports = () => useQuery({ queryKey: queryKeys.imports(), queryFn: () => apiGet<ImportBatch[]>('/imports') });

export const useImportErrors = (batchId: number | null) =>
  useQuery({
    queryKey: queryKeys.importErrors(batchId ?? 0),
    queryFn: () => apiGet<ImportError[]>(`/imports/${batchId}/errors`),
    enabled: batchId !== null && batchId > 0,
  });
