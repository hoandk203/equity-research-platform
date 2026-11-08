'use client';
import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { formatMoney, formatVnd } from '../lib/format';
import type { Label } from '../lib/labels';
import { useAppSelector } from '../store/store';

export function Badge({ label }: { label: Label }) {
  return (
    <span className={`badge badge-${label.tone}`} title={label.hint}>
      {label.text}
    </span>
  );
}

export function Loading({ text = 'Đang tải dữ liệu…' }: { text?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      {text}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <strong>{title}</strong>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const e = error instanceof ApiError ? error : null;
  return (
    <div className="state state-error" role="alert">
      <strong>{e ? e.message : 'Đã xảy ra lỗi khi tải dữ liệu.'}</strong>
      {e?.details?.length ? (
        <ul>
          {e.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
      {e?.requestId ? <div className="muted small">Mã yêu cầu: {e.requestId}</div> : null}
    </div>
  );
}

/** Money cell honouring the user's display preference (billions or full VND). */
export function Money({ vnd }: { vnd: string | null }) {
  const mode = useAppSelector((s) => s.preferences.moneyMode);
  return (
    <span className="num" title={vnd ? `${formatVnd(vnd)} VND` : 'Không có dữ liệu'}>
      {formatMoney(vnd, mode)}
    </span>
  );
}

/** Unit caption matching the money display preference. */
export function MoneyUnit() {
  const mode = useAppSelector((s) => s.preferences.moneyMode);
  return <>{mode === 'VND' ? 'VND' : 'tỷ đồng'}</>;
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-title">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
