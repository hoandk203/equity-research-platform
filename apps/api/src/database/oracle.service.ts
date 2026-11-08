import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import oracledb from 'oracledb';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export type Row = Record<string, unknown>;
export interface QueryOptions {
  /** Columns to fetch as strings (exact money values instead of JS numbers). */
  asString?: string[];
}

/**
 * Thin wrapper over a node-oracledb pool. Every query runs on a connection tagged with the
 * request id (`clientId` -> CLIENT_IDENTIFIER), so database audit can be traced to a request.
 * Only fixed SQL text with bind variables is executed (see *.repository.ts).
 */
@Injectable()
export class OracleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OracleService.name);
  private pool?: oracledb.Pool;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Owner schema used to qualify view names; validated against an allow-list at startup. */
  get schema(): string {
    return this.config.oracle.schema;
  }

  async onModuleInit(): Promise<void> {
    const { connectString, user, password, poolMax } = this.config.oracle;
    this.pool = await oracledb.createPool({ connectString, user, password, poolMin: 0, poolMax, poolIncrement: 1 });
    // Fail fast with a clear message instead of on the first request.
    await this.withConnection('startup-check', async (conn) => {
      const r = await conn.execute<Row>('SELECT USER AS U FROM dual', [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (r.rows?.[0]?.['U'] !== user) throw new Error(`Connected as ${String(r.rows?.[0]?.['U'])}, expected ${user}`);
    });
    this.logger.log(`Connected to ${connectString} as ${user} (schema ${this.schema})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.close(5);
  }

  async withConnection<T>(requestId: string, fn: (conn: oracledb.Connection) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('Oracle pool is not initialised');
    const conn = await this.pool.getConnection();
    try {
      conn.clientId = requestId;
      return await fn(conn);
    } finally {
      try {
        conn.clientId = '';
      } finally {
        await conn.release();
      }
    }
  }

  async query<T extends Row = Row>(requestId: string, sql: string, binds: oracledb.BindParameters = {}, options: QueryOptions = {}): Promise<T[]> {
    const fetchInfo: NonNullable<oracledb.ExecuteOptions['fetchInfo']> = {};
    for (const col of options.asString ?? []) fetchInfo[col] = { type: oracledb.STRING };
    return this.withConnection(requestId, async (conn) => {
      const r = await conn.execute<T>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo });
      return r.rows ?? [];
    });
  }
}
