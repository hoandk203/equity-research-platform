import { z } from 'zod';
import { MAX_SCREENING_CONDITIONS, METRIC_YEARS, SCREENING_OPERATORS } from '@erp/contracts';

/** Form schema: limits come from @erp/contracts so the UI and the API agree. */
export const screeningFormSchema = z.object({
  year: z.coerce.number().refine((y) => (METRIC_YEARS as readonly number[]).includes(y), { message: 'Chọn năm 2023, 2024 hoặc 2025' }),
  conditions: z
    .array(
      z.object({
        metric: z.string().min(1, 'Chọn chỉ số'),
        op: z.enum(SCREENING_OPERATORS, { message: 'Chọn toán tử' }),
        value: z.coerce
          .number({ message: 'Nhập một số' })
          .refine((v) => Number.isFinite(v), { message: 'Nhập một số' })
          .refine((v) => Math.abs(v) < 1e9, { message: 'Ngưỡng quá lớn' }),
      }),
    )
    .min(1, 'Cần ít nhất một điều kiện')
    .max(MAX_SCREENING_CONDITIONS, `Tối đa ${MAX_SCREENING_CONDITIONS} điều kiện`)
    .refine((list) => new Set(list.map((c) => `${c.metric}|${c.op}`)).size === list.length, {
      message: 'Có điều kiện bị lặp (cùng chỉ số và toán tử)',
    }),
});

export type ScreeningFormInput = z.input<typeof screeningFormSchema>;
export type ScreeningFormValues = z.output<typeof screeningFormSchema>;
