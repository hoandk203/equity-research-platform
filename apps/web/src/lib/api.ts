import type { ApiErrorBody } from '@erp/contracts';

export const API_URL = (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000/api').replace(/\/$/, '');

/** Error returned by the API in the common format; keeps the request id for support/audit. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function newRequestId(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `web-${rnd}`;
}

type Params = Record<string, string | number | undefined | null>;

export function buildUrl(path: string, params: Params = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const q = qs.toString();
  return `${API_URL}${path}${q ? `?${q}` : ''}`;
}

async function request<T>(method: 'GET' | 'POST', path: string, params?: Params, body?: unknown): Promise<T> {
  const requestId = newRequestId();
  let res: Response;
  try {
    res = await fetch(buildUrl(path, params), {
      method,
      headers: { 'X-Request-Id': requestId, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được tới máy chủ API.', requestId);
  }
  if (res.ok) return (await res.json()) as T;
  let parsed: ApiErrorBody | null = null;
  try {
    parsed = (await res.json()) as ApiErrorBody;
  } catch {
    // non-JSON error body
  }
  const e = parsed?.error;
  throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? 'Lỗi không xác định.', e?.requestId ?? res.headers.get('x-request-id'), e?.details ?? []);
}

export const apiGet = <T>(path: string, params?: Params) => request<T>('GET', path, params);
export const apiPost = <T>(path: string, body: unknown) => request<T>('POST', path, undefined, body);
