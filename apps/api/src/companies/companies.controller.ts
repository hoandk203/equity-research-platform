import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SEARCH_MAX_LENGTH, type CompanyDetail, type CompanySummary } from '@erp/contracts';
import { RequestId } from '../common/request-id';
import { ParseSymbolPipe } from '../common/params';
import { CompaniesService } from './companies.service';

export class CompanySearchDto {
  @IsOptional()
  @IsString({ message: 'q phải là chuỗi' })
  @MaxLength(SEARCH_MAX_LENGTH, { message: `q tối đa ${SEARCH_MAX_LENGTH} ký tự` })
  q?: string;
}

@ApiTags('Doanh nghiệp')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'S1 — Danh sách doanh nghiệp, tìm theo mã hoặc tên (không phân biệt dấu)' })
  @ApiQuery({ name: 'q', required: false, example: 'hoa phat' })
  @ApiOkResponse({ schema: { example: [{ symbol: 'HPG', companyName: 'Công ty Cổ phần Tập đoàn Hòa Phát', exchange: 'HOSE', years: [2022, 2023, 2024, 2025] }] } })
  list(@RequestId() requestId: string, @Query() query: CompanySearchDto): Promise<CompanySummary[]> {
    return this.service.list(requestId, query.q);
  }

  @Get(':symbol')
  @ApiOperation({ summary: 'S2 — Thông tin doanh nghiệp và các bộ báo cáo hiện hành theo năm' })
  @ApiParam({ name: 'symbol', example: 'VNM' })
  @ApiNotFoundResponse({ description: 'Mã không tồn tại' })
  detail(@RequestId() requestId: string, @Param('symbol', ParseSymbolPipe) symbol: string): Promise<CompanyDetail> {
    return this.service.detail(requestId, symbol);
  }
}
