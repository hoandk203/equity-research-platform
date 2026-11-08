import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_YEAR, MIN_YEAR, SYMBOL_PATTERN } from '@erp/contracts';

/** Upper-cases and validates a ticker path parameter before it reaches any query. */
@Injectable()
export class ParseSymbolPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const symbol = String(value ?? '').trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(symbol)) {
      throw new BadRequestException({ code: 'INVALID_SYMBOL', message: 'Mã chứng khoán không hợp lệ.' });
    }
    return symbol;
  }
}

/** Positive integer path parameter (result id, batch id). */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const n = Number(value);
    if (!/^\d{1,15}$/.test(String(value)) || !Number.isSafeInteger(n) || n <= 0) {
      throw new BadRequestException({ code: 'INVALID_ID', message: 'Mã định danh phải là số nguyên dương.' });
    }
    return n;
  }
}

export class YearQueryDto {
  @ApiProperty({ example: 2025, description: 'Năm tài chính' })
  @Type(() => Number)
  @IsInt({ message: 'year phải là số nguyên' })
  @Min(MIN_YEAR, { message: `year phải từ ${MIN_YEAR}` })
  @Max(MAX_YEAR, { message: `year không được vượt ${MAX_YEAR}` })
  year!: number;
}

export function toIso(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : value == null ? null : String(value);
}

export function toDateOnly(value: unknown): string | null {
  if (!(value instanceof Date)) return value == null ? null : String(value);
  // DATE columns hold a calendar day; format in local parts to avoid a UTC shift.
  const p = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
}

export const num = (v: unknown): number | null => (v == null ? null : Number(v));
export const str = (v: unknown): string | null => (v == null ? null : String(v));
