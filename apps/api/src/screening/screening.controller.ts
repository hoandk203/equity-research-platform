import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';
import {
  DATE_PATTERN, MAX_SCREENING_CONDITIONS, MAX_YEAR, METRIC_CODE_PATTERN, MIN_YEAR, SCREENING_OPERATORS,
  type ScreeningOperator, type ScreeningResponse,
} from '@erp/contracts';
import { RequestId } from '../common/request-id';
import { isCalendarDate } from '../market/market.service';
import { ScreeningRepository } from './screening.repository';

export class ScreeningConditionDto {
  @ApiProperty({ example: 'NET_MARGIN' })
  @Matches(METRIC_CODE_PATTERN, { message: 'Mã chỉ số không hợp lệ' })
  metric!: string;

  @ApiProperty({ enum: SCREENING_OPERATORS, example: '>=' })
  @IsIn(SCREENING_OPERATORS as unknown as string[], { message: 'Toán tử phải là một trong >=, >, <=, <, =' })
  op!: ScreeningOperator;

  @ApiProperty({ example: 0.1, description: 'Đơn vị lưu trữ: % gửi dạng tỷ lệ (10% = 0.10), lần giữ nguyên, VND gửi bằng đồng' })
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Ngưỡng phải là số' })
  value!: number;
}

export class ScreeningRequestDto {
  @ApiPropertyOptional({ example: 2024, description: 'Chế độ năm: chỉ số tài chính của năm này (gửi year hoặc date)' })
  @IsOptional()
  @IsInt({ message: 'year phải là số nguyên' })
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  year?: number;

  @ApiPropertyOptional({ example: '2025-06-30', description: 'Chế độ ngày: chỉ số tài chính + định giá + thị trường tại phiên gần nhất ≤ date' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'date phải có dạng YYYY-MM-DD' })
  date?: string;

  @ApiProperty({ type: [ScreeningConditionDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất một điều kiện' })
  @ArrayMaxSize(MAX_SCREENING_CONDITIONS, { message: `Tối đa ${MAX_SCREENING_CONDITIONS} điều kiện` })
  @ValidateNested({ each: true })
  @Type(() => ScreeningConditionDto)
  conditions!: ScreeningConditionDto[];
}

@ApiTags('Sàng lọc')
@Controller('screening')
export class ScreeningController {
  constructor(private readonly repo: ScreeningRepository) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'S3 — Sàng lọc nhiều điều kiện AND theo năm (tài chính) hoặc theo ngày (tài chính + định giá + thị trường); Oracle quyết định Đạt / Không đạt / Chưa xác định' })
  @ApiOkResponse({ description: 'Mọi doanh nghiệp, PASS trước rồi UNKNOWN, FAIL' })
  @ApiBadRequestResponse({ description: 'Đầu vào sai (kiểm tra ở API hoặc ORA-20401…20406 của Oracle)' })
  async screen(@RequestId() requestId: string, @Body() body: ScreeningRequestDto): Promise<ScreeningResponse> {
    if ((body.year === undefined) === (body.date === undefined)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Gửi đúng một trong hai: year (chế độ năm) hoặc date (chế độ ngày).' });
    }
    if (body.date !== undefined) {
      if (!isCalendarDate(body.date)) throw new BadRequestException({ code: 'INVALID_DATE', message: 'date phải là ngày hợp lệ dạng YYYY-MM-DD.' });
      const rows = await this.repo.screenAt(requestId, body.date, body.conditions);
      return { year: rows.find((r) => r.reportYear !== null)?.reportYear ?? null, date: body.date, conditions: body.conditions, rows };
    }
    const year = body.year as number;
    const rows = await this.repo.screen(requestId, year, body.conditions);
    return { year, date: null, conditions: body.conditions, rows };
  }
}
