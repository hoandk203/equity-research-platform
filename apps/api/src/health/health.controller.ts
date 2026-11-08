import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@erp/contracts';
import oracledb from 'oracledb';
import { OracleService } from '../database/oracle.service';
import { RequestId } from '../common/request-id';

@ApiTags('Hệ thống')
@Controller('health')
export class HealthController {
  constructor(private readonly oracle: OracleService) {}

  @Get()
  @ApiOperation({ summary: 'Kiểm tra kết nối: tài khoản Oracle đang dùng và mã request gắn vào session' })
  @ApiOkResponse({ schema: { example: { status: 'ok', database: { user: 'ERP_APP', schema: 'ERP_DESIGN_V1', clientIdentifier: 'req-…', serverVersion: '23.26.3.0.0' }, requestId: 'req-…' } } })
  async health(@RequestId() requestId: string): Promise<HealthResponse> {
    return this.oracle.withConnection(requestId, async (conn) => {
      const r = await conn.execute<Record<string, string | null>>(
        "SELECT USER AS U, SYS_CONTEXT('USERENV','CLIENT_IDENTIFIER') AS CID FROM dual",
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = r.rows?.[0] ?? {};
      return {
        status: 'ok',
        database: { user: String(row['U']), schema: this.oracle.schema, clientIdentifier: row['CID'] ?? null, serverVersion: conn.oracleServerVersionString },
        requestId,
      };
    });
  }
}
