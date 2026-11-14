'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { MAX_SCREENING_CONDITIONS, METRIC_YEARS, SCREENING_OPERATORS } from '@erp/contracts';
import { METRIC_GROUP, OPERATOR } from '../lib/labels';
import { unitLabel } from '../lib/format';
import { screeningFormSchema, type ScreeningFormInput, type ScreeningFormValues, type ScreeningMetric } from '../lib/screening-form';

interface Props {
  catalog: ScreeningMetric[];
  defaultValues: ScreeningFormValues;
  onSubmit: (values: ScreeningFormValues) => void;
  onChange?: (values: ScreeningFormValues) => void;
  serverError?: string | null;
  /** Latest session with prices (date-mode hint and input bound). */
  lastDate?: string | null;
}

const GROUPS = ['FINANCIAL', 'VALUATION', 'MARKET'] as const;

/**
 * Multi-condition AND form (FR-04, P-07). Thresholds are typed in display units: 10 = 10%,
 * market cap in billion VND, prices in thousand VND.
 */
export function ScreeningForm({ catalog, defaultValues, onSubmit, onChange, serverError, lastDate }: Props) {
  const financial = useMemo(() => new Set(catalog.filter((m) => m.group === 'FINANCIAL').map((m) => m.metricCode)), [catalog]);
  const form = useForm<ScreeningFormInput, unknown, ScreeningFormValues>({
    resolver: zodResolver(screeningFormSchema(financial)),
    defaultValues,
    mode: 'onSubmit',
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'conditions' });
  const errors = formState.errors;
  const mode = watch('mode');
  const metricOf = (code: string) => catalog.find((m) => m.metricCode === code);
  const groups = mode === 'date' ? GROUPS : (['FINANCIAL'] as const);

  const submit = handleSubmit((values) => {
    onChange?.(values);
    onSubmit(values);
  });

  return (
    <form onSubmit={submit} className="card" aria-label="Điều kiện sàng lọc" noValidate>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <fieldset className="seg" style={{ padding: 0, margin: 0 }}>
          <legend className="sr-only">Chế độ sàng lọc</legend>
          <label className={mode === 'year' ? 'seg-opt on' : 'seg-opt'}>
            <input type="radio" value="year" {...register('mode')} /> Theo năm tài chính
          </label>
          <label className={mode === 'date' ? 'seg-opt on' : 'seg-opt'}>
            <input type="radio" value="date" {...register('mode')} /> Theo ngày (có định giá, thị trường)
          </label>
        </fieldset>
        {mode === 'year' ? (
          <>
            <label htmlFor="screen-year">
              <strong>Năm tài chính</strong>
            </label>
            <select id="screen-year" {...register('year')} className={errors.year ? 'invalid' : undefined}>
              {METRIC_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label htmlFor="screen-date">
              <strong>Ngày</strong>
            </label>
            <input id="screen-date" type="date" max={lastDate ?? undefined} {...register('date')} className={errors.date ? 'invalid' : undefined} />
            {errors.date ? <span className="field-error">{errors.date.message}</span> : null}
          </>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Mọi điều kiện đều phải đạt (AND). Ngưỡng nhập theo đơn vị hiển thị: 10 nghĩa là 10%; vốn hóa tính bằng tỷ đồng, giá bằng nghìn đồng.
        {mode === 'date'
          ? ' Mỗi mã dùng phiên gần nhất trước hoặc bằng ngày chọn; chỉ số tài chính lấy theo năm BCTC của chính sách hồi cứu (BCTC năm N dùng từ 01/04 năm N+1).'
          : ''}
      </p>
      {fields.map((f, i) => {
        const metric = String(watch(`conditions.${i}.metric`) ?? '');
        const m = metricOf(metric);
        const err = errors.conditions?.[i];
        return (
          <div className="condition-row" key={f.id} data-testid="condition-row">
            <div>
              <select aria-label={`Chỉ số điều kiện ${i + 1}`} {...register(`conditions.${i}.metric`)} className={err?.metric ? 'invalid' : undefined} style={{ width: '100%' }}>
                <option value="">— Chọn chỉ số —</option>
                {groups.map((g) => (
                  <optgroup key={g} label={METRIC_GROUP[g]}>
                    {catalog
                      .filter((x) => x.group === g)
                      .map((x) => (
                        <option key={x.metricCode} value={x.metricCode}>
                          {x.metricName}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              {err?.metric ? <div className="field-error">{err.metric.message}</div> : null}
            </div>
            <select aria-label={`Toán tử điều kiện ${i + 1}`} {...register(`conditions.${i}.op`)}>
              {SCREENING_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR[op]}
                </option>
              ))}
            </select>
            <div>
              <div className="unit">
                <input aria-label={`Ngưỡng điều kiện ${i + 1}`} type="number" step="any" inputMode="decimal" {...register(`conditions.${i}.value`)} className={err?.value ? 'invalid' : undefined} />
                <span>{unitLabel(m?.displayUnit, metric)}</span>
              </div>
              {err?.value ? <div className="field-error">{err.value.message}</div> : null}
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => remove(i)} disabled={fields.length <= 1} aria-label={`Xóa điều kiện ${i + 1}`}>
              Xóa
            </button>
          </div>
        );
      })}
      {errors.conditions?.root?.message || errors.conditions?.message ? (
        <div className="field-error" role="alert">
          {errors.conditions?.root?.message ?? errors.conditions?.message}
        </div>
      ) : null}
      {serverError ? (
        <div className="field-error" role="alert">
          {serverError}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={() => append({ metric: '', op: '>=', value: 0 })} disabled={fields.length >= MAX_SCREENING_CONDITIONS}>
          + Thêm điều kiện
        </button>
        <button type="submit" className="btn">
          Sàng lọc
        </button>
      </div>
    </form>
  );
}
