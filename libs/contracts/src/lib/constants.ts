/** Limits shared by the API (validation) and the web app (forms, URL parsing). */

/** Years that have a current report set (2022 is the base year without metrics). */
export const REPORT_YEARS = [2022, 2023, 2024, 2025] as const;
/** Years that have metrics and can be screened or compared. */
export const METRIC_YEARS = [2023, 2024, 2025] as const;
export const DEFAULT_YEAR = 2025;

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2200;

export const SCREENING_OPERATORS = ['>=', '>', '<=', '<', '='] as const;
export type ScreeningOperator = (typeof SCREENING_OPERATORS)[number];
export const MAX_SCREENING_CONDITIONS = 10;
/** Financial (ROE) and market metric codes (RETURN_1Y, MA200): upper-case, digits, underscore. */
export const METRIC_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,59}$/;

export const MIN_COMPARE_SYMBOLS = 2;
export const MAX_COMPARE_SYMBOLS = 3;

export const SEARCH_MAX_LENGTH = 50;
/** Exchange tickers: upper-case letters, digits and underscore. */
export const SYMBOL_PATTERN = /^[A-Z0-9_]{1,20}$/;
/** Client-supplied request ids are accepted only in this shape; otherwise the API generates one. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;
export const REQUEST_ID_HEADER = 'x-request-id';
