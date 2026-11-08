import { Injectable } from '@nestjs/common';
import type { BatchStatus, ImportBatch, ImportError } from '@erp/contracts';
import { OracleService } from '../database/oracle.service';
import { num, str, toIso } from '../common/params';

/** Read-only access to v_import_batches / v_import_errors (no staging payload or file paths). */
@Injectable()
export class ImportsRepository {
  private readonly sqlBatches: string;
  private readonly sqlBatch: string;
  private readonly sqlErrors: string;

  constructor(private readonly oracle: OracleService) {
    const s = oracle.schema;
    const cols = `batch_id, batch_key, contract_version, mapping_version, batch_status, started_at, finished_at,
      received_count, imported_count, rejected_count, skipped_count, error_count`;
    this.sqlBatches = `SELECT ${cols} FROM ${s}.v_import_batches ORDER BY batch_id DESC`;
    this.sqlBatch = `SELECT ${cols} FROM ${s}.v_import_batches WHERE batch_id = :batchId`;
    this.sqlErrors = `SELECT error_id, batch_id, row_no, source_symbol, fiscal_year_raw, item_code_raw, error_code, error_message, logged_at
      FROM ${s}.v_import_errors WHERE batch_id = :batchId ORDER BY error_id`;
  }

  async batches(requestId: string): Promise<ImportBatch[]> {
    return (await this.oracle.query(requestId, this.sqlBatches)).map(toBatch);
  }

  async batch(requestId: string, batchId: number): Promise<ImportBatch | null> {
    const rows = await this.oracle.query(requestId, this.sqlBatch, { batchId });
    return rows.length ? toBatch(rows[0]) : null;
  }

  async errors(requestId: string, batchId: number): Promise<ImportError[]> {
    return (await this.oracle.query(requestId, this.sqlErrors, { batchId })).map((r) => ({
      errorId: Number(r['ERROR_ID']),
      batchId: Number(r['BATCH_ID']),
      rowNo: num(r['ROW_NO']),
      sourceSymbol: str(r['SOURCE_SYMBOL']),
      fiscalYearRaw: str(r['FISCAL_YEAR_RAW']),
      itemCodeRaw: str(r['ITEM_CODE_RAW']),
      errorCode: String(r['ERROR_CODE']),
      errorMessage: String(r['ERROR_MESSAGE']),
      loggedAt: toIso(r['LOGGED_AT']) ?? '',
    }));
  }
}

function toBatch(r: Record<string, unknown>): ImportBatch {
  return {
    batchId: Number(r['BATCH_ID']),
    batchKey: String(r['BATCH_KEY']),
    contractVersion: String(r['CONTRACT_VERSION']),
    mappingVersion: String(r['MAPPING_VERSION']),
    status: String(r['BATCH_STATUS']) as BatchStatus,
    startedAt: toIso(r['STARTED_AT']) ?? '',
    finishedAt: toIso(r['FINISHED_AT']),
    receivedCount: Number(r['RECEIVED_COUNT']),
    importedCount: Number(r['IMPORTED_COUNT']),
    rejectedCount: Number(r['REJECTED_COUNT']),
    skippedCount: Number(r['SKIPPED_COUNT']),
    errorCount: Number(r['ERROR_COUNT']),
  };
}
