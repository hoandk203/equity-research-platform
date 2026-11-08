import { MAX_SCREENING_CONDITIONS, SCREENING_OPERATORS, type ScreeningOperator } from '@erp/contracts';

/** A condition as typed by the user: threshold in display units (10 means 10%). */
export interface DraftCondition {
  metric: string;
  op: ScreeningOperator;
  value: number;
}

const OP_CODE: Record<ScreeningOperator, string> = { '>=': 'ge', '>': 'gt', '<=': 'le', '<': 'lt', '=': 'eq' };
const CODE_OP = Object.fromEntries(Object.entries(OP_CODE).map(([k, v]) => [v, k])) as Record<string, ScreeningOperator>;

/** URL form: `NET_MARGIN~ge~10;CURRENT_RATIO~ge~1` (readable, shareable, reload-safe). */
export function encodeConditions(conditions: DraftCondition[]): string {
  return conditions.map((c) => `${c.metric}~${OP_CODE[c.op]}~${c.value}`).join(';');
}

/** Returns null when the text is not a valid condition list (bad links are ignored, not trusted). */
export function decodeConditions(text: string | null | undefined): DraftCondition[] | null {
  if (!text) return null;
  const parts = text.split(';').filter(Boolean);
  if (!parts.length || parts.length > MAX_SCREENING_CONDITIONS) return null;
  const out: DraftCondition[] = [];
  for (const p of parts) {
    const [metric, opCode, raw] = p.split('~');
    const op = CODE_OP[opCode ?? ''];
    const value = Number(raw);
    if (!metric || !/^[A-Z_]{2,60}$/.test(metric) || !op || !SCREENING_OPERATORS.includes(op) || raw === '' || !Number.isFinite(value)) return null;
    out.push({ metric, op, value });
  }
  return out;
}
