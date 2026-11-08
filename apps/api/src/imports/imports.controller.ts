import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { ImportBatch, ImportError } from '@erp/contracts';
import { RequestId } from '../common/request-id';
import { ParseIdPipe } from '../common/params';
import { ImportsRepository } from './imports.repository';

@ApiTags('Đợt nhập')
@Controller('imports')
export class ImportsController {
  constructor(private readonly repo: ImportsRepository) {}

  @Get()
  @ApiOperation({ summary: 'S5 — Danh sách đợt nhập, mới nhất trước, kèm bộ đếm nhận/nhập/từ chối/bỏ qua/lỗi' })
  batches(@RequestId() requestId: string): Promise<ImportBatch[]> {
    return this.repo.batches(requestId);
  }

  @Get(':batchId/errors')
  @ApiOperation({ summary: 'S5 — Lỗi của một đợt nhập (mã lỗi, dòng, đối tượng, nguyên nhân)' })
  @ApiParam({ name: 'batchId', example: 1 })
  @ApiNotFoundResponse({ description: 'Đợt nhập không tồn tại' })
  async errors(@RequestId() requestId: string, @Param('batchId', ParseIdPipe) batchId: number): Promise<ImportError[]> {
    if (!(await this.repo.batch(requestId, batchId))) {
      throw new NotFoundException({ code: 'BATCH_NOT_FOUND', message: `Không tìm thấy đợt nhập ${batchId}.` });
    }
    return this.repo.errors(requestId, batchId);
  }
}
