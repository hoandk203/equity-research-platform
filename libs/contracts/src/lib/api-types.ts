/**
 * Response shapes of the REST API. Money in VND is a decimal string (values reach 1e13 and
 * are stored as NUMBER(28,0)); ratios are numbers. Every nullable value means "not available"
 * and must never be rendered as 0.
 */

export type MetricStatus =
  | 'VALID'
  | 'CALCULATED_PROVISIONAL'
  | 'MISSING_INPUT'
  | 'INVALID_DENOMINATOR'
  | 'BLOCKED_INPUT_QUALITY';

export type DisplayUnit = 'PERCENT' | 'TIMES';
export type StatementKind = 'BS' | 'IS' | 'CF';
export type LineStatus = 'VERIFIED' | 'PROVISIONAL' | 'BLOCKED' | 'MISSING';
export type BatchStatus = 'CREATED' | 'STAGED' | 'VALIDATED' | 'IMPORTING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string; details?: string[] };
}

export interface HealthResponse {
  status: 'ok';
  database: { user: string; schema: string; clientIdentifier: string | null; serverVersion: string };
  requestId: string;
}

export interface CompanySummary {
  symbol: string;
  companyName: string;
  exchange: string;
  years: number[];
}

export interface ReportSetInfo {
  fiscalYear: number;
  scope: string;
  reportSetId: number;
  selectionVersion: number;
  datasetVersion: string;
  acceptanceStatus: string;
  publicationStatus: 'KNOWN' | 'UNKNOWN';
}

export interface CompanyDetail {
  symbol: string;
  companyName: string;
  exchange: string;
  reportSets: ReportSetInfo[];
}

export interface ReportLine {
  statementKind: StatementKind;
  itemCode: string;
  lineName: string;
  rawCode: string | null;
  lineStatus: LineStatus;
  effectiveValueVnd: string | null;
  providerValueVnd: string | null;
  isCorrected: boolean;
  correction: null | {
    key: string;
    reason: string;
    status: string;
    page: number | null;
    pdfSha256: string | null;
    pdfUrl: string | null;
  };
  openIssueCount: number;
}

export interface ReportSource {
  sourceReportType: string | null;
  currency: string | null;
  originalUnit: string | null;
  fiscalStart: string | null;
  fiscalEnd: string | null;
  metadataStatus: string | null;
  providerSha256: string | null;
  providerUrl: string | null;
}

export interface ReportLinesResponse {
  symbol: string;
  year: number;
  reportSet: ReportSetInfo | null;
  /** One entry per statement (BS/IS/CF) present in the set. */
  sources: Partial<Record<StatementKind, ReportSource>>;
  lines: ReportLine[];
}

export interface MetricValue {
  resultId: number;
  metricCode: string;
  metricName: string;
  formulaVersion: string;
  value: number | null;
  displayValue: number | null;
  displayUnit: DisplayUnit;
  status: MetricStatus;
  reasonCodes: string | null;
}

export interface MetricsResponse {
  symbol: string;
  year: number;
  metrics: MetricValue[];
}

export interface MetricCatalogItem {
  metricCode: string;
  formulaVersion: string;
  metricName: string;
  formulaText: string;
  displayUnit: DisplayUnit;
  inputCount: number;
  requiresPrevious: boolean;
}

export interface LineageInput {
  position: number;
  yearOffset: number;
  inputYear: number;
  itemCode: string;
  lineName: string | null;
  effectiveValueVnd: string | null;
  providerValueVnd: string | null;
  correctionKey: string | null;
  selectedQuality: string;
  providerSha256: string | null;
  providerUrl: string | null;
  issuerPdfSha256: string | null;
  issuerPdfUrl: string | null;
  issuerPdfPage: number | null;
}

export interface LineageResponse {
  result: {
    resultId: number;
    symbol: string;
    fiscalYear: number;
    metricCode: string;
    metricName: string;
    value: number | null;
    storedStatus: MetricStatus;
    /** Status as shown on current screens; null when this result is no longer current. */
    currentStatus: MetricStatus | null;
    runId: number;
  };
  formula: MetricCatalogItem;
  inputs: LineageInput[];
}

export interface CompareCell {
  symbol: string;
  value: number | null;
  displayValue: number | null;
  /** Source status, or NOT_AVAILABLE when the company has no result for that year. */
  status: MetricStatus | 'NOT_AVAILABLE';
  /** VALUE only for VALID results; anything else is UNKNOWN (no fallback to another year). */
  compareStatus: 'VALUE' | 'UNKNOWN';
}

export interface CompareRow {
  metricCode: string;
  metricName: string;
  displayUnit: DisplayUnit;
  cells: CompareCell[];
}

export interface CompareResponse {
  year: number;
  symbols: string[];
  rows: CompareRow[];
}

export interface ImportBatch {
  batchId: number;
  batchKey: string;
  contractVersion: string;
  mappingVersion: string;
  status: BatchStatus;
  startedAt: string;
  finishedAt: string | null;
  receivedCount: number;
  importedCount: number;
  rejectedCount: number;
  skippedCount: number;
  errorCount: number;
}

export interface ImportError {
  errorId: number;
  batchId: number;
  rowNo: number | null;
  sourceSymbol: string | null;
  fiscalYearRaw: string | null;
  itemCodeRaw: string | null;
  errorCode: string;
  errorMessage: string;
  loggedAt: string;
}
