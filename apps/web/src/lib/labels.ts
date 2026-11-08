import type { BatchStatus, LineStatus, MetricStatus, ScreeningOperator, ScreeningOutcome, StatementKind } from '@erp/contracts';

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';
export interface Label {
  text: string;
  tone: Tone;
  hint?: string;
}

/** Single source of status wording for every screen (docs/13 §7). */
export const METRIC_STATUS: Record<MetricStatus | 'NOT_AVAILABLE', Label> = {
  VALID: { text: 'Hợp lệ', tone: 'ok', hint: 'Đã nghiệm thu, dùng cho sàng lọc' },
  CALCULATED_PROVISIONAL: { text: 'Tạm tính', tone: 'warn', hint: 'Tính được nhưng đầu vào chưa nghiệm thu đủ' },
  MISSING_INPUT: { text: 'Thiếu dữ liệu', tone: 'warn', hint: 'Thiếu số đầu vào hoặc năm trước' },
  INVALID_DENOMINATOR: { text: 'Mẫu số không hợp lệ', tone: 'warn', hint: 'Mẫu số bằng 0 hoặc âm' },
  BLOCKED_INPUT_QUALITY: { text: 'Bị chặn do chất lượng', tone: 'bad', hint: 'Đầu vào có vấn đề chất lượng đang mở' },
  NOT_AVAILABLE: { text: 'Không có chỉ số', tone: 'neutral', hint: 'Năm hoặc doanh nghiệp không có kết quả' },
};

export const OUTCOME: Record<ScreeningOutcome, Label> = {
  PASS: { text: 'Đạt', tone: 'ok' },
  FAIL: { text: 'Không đạt', tone: 'bad' },
  UNKNOWN: { text: 'Chưa xác định', tone: 'warn' },
};

export const LINE_STATUS: Record<LineStatus, Label> = {
  VERIFIED: { text: 'Đã xác minh', tone: 'ok' },
  PROVISIONAL: { text: 'Tạm thời', tone: 'warn' },
  BLOCKED: { text: 'Bị chặn', tone: 'bad' },
  MISSING: { text: 'Thiếu', tone: 'warn' },
};

export const BATCH_STATUS: Record<BatchStatus, Label> = {
  CREATED: { text: 'Mới tạo', tone: 'neutral' },
  STAGED: { text: 'Đã nạp staging', tone: 'neutral' },
  VALIDATED: { text: 'Đã kiểm định', tone: 'neutral' },
  IMPORTING: { text: 'Đang nhập', tone: 'warn' },
  COMPLETED: { text: 'Hoàn tất', tone: 'ok' },
  PARTIAL: { text: 'Một phần', tone: 'warn' },
  FAILED: { text: 'Thất bại', tone: 'bad' },
};

export const STATEMENT: Record<StatementKind, string> = {
  BS: 'Bảng cân đối kế toán',
  IS: 'Kết quả hoạt động kinh doanh',
  CF: 'Lưu chuyển tiền tệ',
};

export const OPERATOR: Record<ScreeningOperator, string> = { '>=': '≥', '>': '>', '<=': '≤', '<': '<', '=': '=' };

export function labelOf<K extends string>(map: Record<K, Label>, key: string | null | undefined): Label {
  return (key && (map as Record<string, Label>)[key]) || { text: key ?? '—', tone: 'neutral' };
}
