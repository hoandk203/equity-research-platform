'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useImportErrors, useImports } from '../../lib/queries';
import { formatDateTime } from '../../lib/format';
import { BATCH_STATUS, labelOf } from '../../lib/labels';
import { Badge, Empty, ErrorBox, Loading, PageTitle } from '../ui';

/** S5 — import batches with counters and their errors (FR-06). Selected batch lives in ?batch=. */
export function ImportsScreen() {
  const params = useSearchParams();
  const raw = Number(params.get('batch'));
  const selected = Number.isInteger(raw) && raw > 0 ? raw : null;
  const batches = useImports();
  const errors = useImportErrors(selected);
  const current = batches.data?.find((b) => b.batchId === selected) ?? null;

  return (
    <>
      <PageTitle title="Đợt nhập dữ liệu" subtitle="Mỗi đợt nhập đi qua staging, kiểm định rồi mới ghi vào bảng nghiệp vụ; dòng trùng được bỏ qua chứ không ghi đè." />
      {batches.isLoading ? <Loading /> : null}
      {batches.error ? <ErrorBox error={batches.error} /> : null}
      {batches.data && batches.data.length === 0 ? <Empty title="Chưa có đợt nhập nào" /> : null}
      {batches.data && batches.data.length > 0 ? (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Đợt</th>
                <th>Khóa đợt nhập</th>
                <th>Trạng thái</th>
                <th>Bắt đầu</th>
                <th className="right">Nhận</th>
                <th className="right">Nhập</th>
                <th className="right">Từ chối</th>
                <th className="right">Bỏ qua (trùng)</th>
                <th className="right">Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {batches.data.map((b) => (
                <tr key={b.batchId} className={b.batchId === selected ? 'selected' : undefined}>
                  <td>
                    <Link href={`/dot-nhap?batch=${b.batchId}`} scroll={false}>
                      #{b.batchId}
                    </Link>
                  </td>
                  <td className="mono">{b.batchKey}</td>
                  <td>
                    <Badge label={labelOf(BATCH_STATUS, b.status)} />
                  </td>
                  <td className="num">{formatDateTime(b.startedAt)}</td>
                  <td className="right num">{b.receivedCount}</td>
                  <td className="right num">{b.importedCount}</td>
                  <td className="right num">{b.rejectedCount}</td>
                  <td className="right num">{b.skippedCount}</td>
                  <td className="right num">{b.errorCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <section className="card" aria-labelledby="errors-title">
          <h2 id="errors-title">Lỗi của đợt #{selected}</h2>
          {current ? (
            <p className="muted small">
              Hợp đồng dữ liệu {current.contractVersion} · ánh xạ {current.mappingVersion} · kết thúc {formatDateTime(current.finishedAt)}
            </p>
          ) : null}
          {errors.isLoading ? <Loading /> : null}
          {errors.error ? <ErrorBox error={errors.error} /> : null}
          {errors.data && errors.data.length === 0 ? <Empty title="Không có lỗi">Mọi dòng của đợt này được nhập hoặc bỏ qua do trùng.</Empty> : null}
          {errors.data && errors.data.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã lỗi</th>
                    <th>Dòng</th>
                    <th>Đối tượng</th>
                    <th>Nguyên nhân</th>
                    <th>Thời điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.data.map((e) => (
                    <tr key={e.errorId}>
                      <td className="mono">{e.errorCode}</td>
                      <td className="num">{e.rowNo ?? '—'}</td>
                      <td>{[e.sourceSymbol, e.fiscalYearRaw, e.itemCodeRaw].filter(Boolean).join(' · ') || '—'}</td>
                      <td>{e.errorMessage}</td>
                      <td className="num">{formatDateTime(e.loggedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="muted">Chọn một đợt để xem lỗi chi tiết.</p>
      )}
    </>
  );
}
