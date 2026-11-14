import { z } from 'zod';
import type { DisplayUnit, MarketUnit, ScreeningMetricGroup } from '@erp/contracts';
import { DATE_PATTERN, MAX_SCREENING_CONDITIONS, METRIC_YEARS, SCREENING_OPERATORS } from '@erp/contracts';

/** One selectable metric of the form: financial (8 formulas) or market/valuation (17). */
export interface ScreeningMetric {
  metricCode: string;
  metricName: string;
  displayUnit: DisplayUnit | MarketUnit;
  group: ScreeningMetricGroup;
}

const isCalendarDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return DATE_PATTERN.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * Form schema: limits come from @erp/contracts so the UI and the API agree. Year mode screens
 * the financial metrics of one fiscal year; date mode adds valuation and market metrics.
 * `financialCodes` lets the schema reject market metrics in year mode.
 */
export function screeningFormSchema(financialCodes?: ReadonlySet<string>) {
  return z
    .object({
      mode: z.enum(['year', 'date']),
      year: z.coerce.number(),
      date: z.string(),
      conditions: z
        .array(
          z.object({
            metric: z.string().min(1, 'Chọn chỉ số'),
            op: z.enum(SCREENING_OPERATORS, { message: 'Chọn toán tử' }),
            value: z.coerce
              .number({ message: 'Nhập một số' })
              .refine((v) => Number.isFinite(v), { message: 'Nhập một số' })
              .refine((v) => Math.abs(v) < 1e12, { message: 'Ngưỡng quá lớn' }),
          }),
        )
        .min(1, 'Cần ít nhất một điều kiện')
        .max(MAX_SCREENING_CONDITIONS, `Tối đa ${MAX_SCREENING_CONDITIONS} điều kiện`)
        .refine((list) => new Set(list.map((c) => `${c.metric}|${c.op}`)).size === list.length, {
          message: 'Có điều kiện bị lặp (cùng chỉ số và toán tử)',
        }),
    })
    .superRefine((v, ctx) => {
      if (v.mode === 'year' && !(METRIC_YEARS as readonly number[]).includes(v.year)) {
        ctx.addIssue({ code: 'custom', path: ['year'], message: 'Chọn năm 2023, 2024 hoặc 2025' });
      }
      if (v.mode === 'date' && !isCalendarDate(v.date)) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'Chọn một ngày hợp lệ' });
      }
      if (v.mode === 'year' && financialCodes) {
        v.conditions.forEach((c, i) => {
          if (c.metric && !financialCodes.has(c.metric)) {
            ctx.addIssue({ code: 'custom', path: ['conditions', i, 'metric'], message: 'Chỉ số định giá/thị trường chỉ dùng ở chế độ theo ngày' });
          }
        });
      }
    });
}

export type ScreeningFormInput = z.input<ReturnType<typeof screeningFormSchema>>;
export type ScreeningFormValues = z.output<ReturnType<typeof screeningFormSchema>>;
