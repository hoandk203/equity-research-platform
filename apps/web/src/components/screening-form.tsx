'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { MAX_SCREENING_CONDITIONS, METRIC_YEARS, SCREENING_OPERATORS, type MetricCatalogItem } from '@erp/contracts';
import { OPERATOR } from '../lib/labels';
import { unitLabel } from '../lib/format';
import { screeningFormSchema, type ScreeningFormInput, type ScreeningFormValues } from '../lib/screening-form';

interface Props {
  catalog: MetricCatalogItem[];
  defaultValues: ScreeningFormValues;
  onSubmit: (values: ScreeningFormValues) => void;
  onChange?: (values: ScreeningFormValues) => void;
  serverError?: string | null;
}

/** Multi-condition AND form (FR-04). Thresholds are typed in display units (10 = 10%). */
export function ScreeningForm({ catalog, defaultValues, onSubmit, onChange, serverError }: Props) {
  const form = useForm<ScreeningFormInput, unknown, ScreeningFormValues>({
    resolver: zodResolver(screeningFormSchema),
    defaultValues,
    mode: 'onSubmit',
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'conditions' });
  const errors = formState.errors;
  const unitOf = (metric: string) => catalog.find((m) => m.metricCode === metric)?.displayUnit ?? null;

  const submit = handleSubmit((values) => {
    onChange?.(values);
    onSubmit(values);
  });

  return (
    <form onSubmit={submit} className="card" aria-label="Điều kiện sàng lọc" noValidate>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
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
        <span className="muted small">Mọi điều kiện đều phải đạt (AND). Ngưỡng nhập theo đơn vị hiển thị: 10 nghĩa là 10%.</span>
      </div>
      {fields.map((f, i) => {
        const metric = watch(`conditions.${i}.metric`);
        const err = errors.conditions?.[i];
        return (
          <div className="condition-row" key={f.id} data-testid="condition-row">
            <div>
              <select aria-label={`Chỉ số điều kiện ${i + 1}`} {...register(`conditions.${i}.metric`)} className={err?.metric ? 'invalid' : undefined} style={{ width: '100%' }}>
                <option value="">— Chọn chỉ số —</option>
                {catalog.map((m) => (
                  <option key={m.metricCode} value={m.metricCode}>
                    {m.metricName}
                  </option>
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
                <span>{unitLabel(unitOf(String(metric ?? '')))}</span>
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
