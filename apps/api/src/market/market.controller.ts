import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiParam, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import {
  DATE_PATTERN, PRICE_BASES, PRICE_INTERVALS,
  type MarketMetricCatalogItem, type MarketSnapshot, type PriceBasis, type PriceInterval, type PriceSeriesResponse, type ValuationResponse,
} from '@erp/contracts';
import { RequestId } from '../common/request-id';
import { ParseSymbolPipe } from '../common/params';
import { MarketService } from './market.service';

export class PriceQueryDto {
  @ApiPropertyOptional({ example: '2025-01-01', description: 'Từ ngày (mặc định: phiên đầu tiên có dữ liệu)' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'from phải có dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2025-12-31', description: 'Đến ngày (mặc định: phiên cuối cùng)' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'to phải có dạng YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ enum: PRICE_BASES, default: 'ADJUSTED' })
  @IsOptional()
  @IsIn(PRICE_BASES as unknown as string[], { message: 'basis phải là ADJUSTED hoặc UNADJUSTED' })
  basis?: PriceBasis;

  @ApiPropertyOptional({ enum: PRICE_INTERVALS, default: 'day' })
  @IsOptional()
  @IsIn(PRICE_INTERVALS as unknown as string[], { message: 'interval phải là day hoặc month' })
  interval?: PriceInterval;
}

export class AsOfQueryDto {
  @ApiPropertyOptional({ example: '2025-06-30', description: 'Ngày xem; dùng phiên gần nhất trước hoặc bằng ngày này (mặc định: phiên cuối cùng)' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'date phải có dạng YYYY-MM-DD' })
  date?: string;
}

@ApiTags('Giá và định giá')
@Controller()
export class MarketController {
  constructor(private readonly service: MarketService) {}

  @Get('market/catalog')
  @ApiOperation({ summary: 'Danh mục chỉ số thị trường và định giá (công thức market-formula/1.0.0, đơn vị)' })
  catalog(@RequestId() requestId: string): Promise<MarketMetricCatalogItem[]> {
    return this.service.catalog(requestId);
  }

  @Get('companies/:symbol/prices')
  @ApiOperation({ summary: 'M1 — Chuỗi giá ngày hoặc tháng (giá điều chỉnh hoặc giá gốc, VND), kèm nguồn và các hiệu chỉnh' })
  @ApiParam({ name: 'symbol', example: 'FPT' })
  @ApiNotFoundResponse({ description: 'Mã không tồn tại' })
  @ApiBadRequestResponse({ description: 'Ngày sai, from > to hoặc quá nhiều phiên' })
  prices(@RequestId() requestId: string, @Param('symbol', ParseSymbolPipe) symbol: string, @Query() q: PriceQueryDto): Promise<PriceSeriesResponse> {
    return this.service.prices(requestId, symbol, q);
  }

  @Get('companies/:symbol/market-metrics')
  @ApiOperation({ summary: 'M2 — Lợi suất, biến động, trung bình động, cao/thấp 52 tuần tại phiên gần nhất ≤ date' })
  @ApiParam({ name: 'symbol', example: 'HPG' })
  @ApiNotFoundResponse({ description: 'Mã không tồn tại' })
  marketMetrics(@RequestId() requestId: string, @Param('symbol', ParseSymbolPipe) symbol: string, @Query() q: AsOfQueryDto): Promise<MarketSnapshot> {
    return this.service.snapshot(requestId, symbol, q.date);
  }

  @Get('companies/:symbol/valuation')
  @ApiOperation({ summary: 'M3 — Vốn hóa, EPS, P/E, BVPS, P/B tại phiên gần nhất ≤ date (BCTC năm theo chính sách hồi cứu)' })
  @ApiParam({ name: 'symbol', example: 'VNM' })
  @ApiNotFoundResponse({ description: 'Mã không tồn tại' })
  valuation(@RequestId() requestId: string, @Param('symbol', ParseSymbolPipe) symbol: string, @Query() q: AsOfQueryDto): Promise<ValuationResponse> {
    return this.service.valuation(requestId, symbol, q.date);
  }
}
