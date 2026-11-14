import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import {
  DATE_PATTERN, MAX_COMPARE_SYMBOLS, MAX_YEAR, MIN_COMPARE_SYMBOLS, MIN_YEAR, SYMBOL_PATTERN,
  type CompareResponse, type LineageResponse, type MetricCatalogItem, type MetricsResponse,
} from '@erp/contracts';
import { RequestId } from '../common/request-id';
import { ParseIdPipe, ParseSymbolPipe, YearQueryDto } from '../common/params';
import { MetricsService } from './metrics.service';

export class CompareQueryDto {
  @ApiProperty({ example: 'FPT,HPG,VNM', description: '2–3 mã, phân cách bằng dấu phẩy' })
  @Transform(({ value }) => String(value ?? '').split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean))
  @IsArray()
  @ArrayMinSize(MIN_COMPARE_SYMBOLS, { message: `Chọn ít nhất ${MIN_COMPARE_SYMBOLS} mã để so sánh` })
  @ArrayMaxSize(MAX_COMPARE_SYMBOLS, { message: `Chọn tối đa ${MAX_COMPARE_SYMBOLS} mã để so sánh` })
  @ArrayUnique({ message: 'Các mã so sánh không được trùng nhau' })
  @Matches(SYMBOL_PATTERN, { each: true, message: 'Mã chứng khoán không hợp lệ' })
  symbols!: string[];

  @ApiProperty({ example: 2024 })
  @Type(() => Number)
  @IsInt({ message: 'year phải là số nguyên' })
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  year!: number;

  @ApiPropertyOptional({ example: '2025-06-30', description: 'Ngày cho hàng định giá/thị trường (mặc định: phiên cuối cùng)' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'date phải có dạng YYYY-MM-DD' })
  date?: string;
}

@ApiTags('Chỉ số')
@Controller()
export class MetricsController {
  constructor(private readonly service: MetricsService) {}

  @Get('metrics/catalog')
  @ApiOperation({ summary: 'Danh mục công thức: tên tiếng Việt, công thức, đơn vị, số đầu vào, có cần năm trước' })
  catalog(@RequestId() requestId: string): Promise<MetricCatalogItem[]> {
    return this.service.catalog(requestId);
  }

  @Get('companies/:symbol/metrics')
  @ApiOperation({ summary: 'S2b — 8 chỉ số hiện hành của một mã/năm (năm 2022 không có chỉ số)' })
  @ApiParam({ name: 'symbol', example: 'VNM' })
  @ApiNotFoundResponse({ description: 'Mã không tồn tại' })
  metrics(@RequestId() requestId: string, @Param('symbol', ParseSymbolPipe) symbol: string, @Query() q: YearQueryDto): Promise<MetricsResponse> {
    return this.service.metrics(requestId, symbol, q.year);
  }

  @Get('metric-results/:resultId/lineage')
  @ApiOperation({ summary: 'S2c — Truy vết một kết quả: công thức và từng đầu vào (số gốc, hiệu chỉnh, hash, trang PDF)' })
  @ApiParam({ name: 'resultId', example: 1 })
  @ApiNotFoundResponse({ description: 'Kết quả không tồn tại' })
  lineage(@RequestId() requestId: string, @Param('resultId', ParseIdPipe) resultId: number): Promise<LineageResponse> {
    return this.service.lineage(requestId, resultId);
  }

  @Get('compare')
  @ApiOperation({ summary: 'S4 — So sánh 2–3 mã cùng năm, cùng phiên bản công thức; thêm hàng định giá/thị trường tại date' })
  @ApiBadRequestResponse({ description: 'Số mã ngoài 2–3, mã trùng/sai hoặc không tồn tại' })
  compare(@RequestId() requestId: string, @Query() q: CompareQueryDto): Promise<CompareResponse> {
    return this.service.compare(requestId, q.symbols, q.year, q.date);
  }
}
