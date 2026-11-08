import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';

/** Business errors raised by pkg_screening (sql/018) and their user-facing meaning. */
const SCREENING_ERRORS: Record<number, { code: string; message: string }> = {
  20401: { code: 'INVALID_YEAR', message: 'Năm tài chính phải là số nguyên hợp lệ.' },
  20402: { code: 'INVALID_CONDITIONS', message: 'Điều kiện sàng lọc phải là danh sách từ 1 đến 10 điều kiện.' },
  20403: { code: 'UNKNOWN_METRIC', message: 'Chỉ số không tồn tại trong danh mục công thức hiện hành.' },
  20404: { code: 'INVALID_OPERATOR', message: 'Toán tử phải là một trong >=, >, <=, <, =.' },
  20405: { code: 'INVALID_THRESHOLD', message: 'Mỗi điều kiện cần một ngưỡng là số.' },
};

export function oracleErrorNumber(err: unknown): number | null {
  if (err && typeof err === 'object') {
    const num = (err as { errorNum?: unknown }).errorNum;
    if (typeof num === 'number' && num > 0) return num;
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') {
      const m = /ORA-(\d{5})/.exec(msg);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

/** Maps known Oracle errors to HTTP errors; returns null for anything that must stay a 500. */
export function mapOracleError(err: unknown): HttpException | null {
  const num = oracleErrorNumber(err);
  if (num === null) return null;
  const known = SCREENING_ERRORS[num];
  if (known) return new BadRequestException({ code: known.code, message: known.message });
  if (num === 1403) return new NotFoundException({ code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu.' });
  return null;
}
