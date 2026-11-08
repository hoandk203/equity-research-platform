import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, Matches, Max, Min, ValidateNested } from 'class-validator';
import {
  MAX_SCREENING_CONDITIONS, MAX_YEAR, MIN_YEAR, SCREENING_OPERATORS,
  type ScreeningOperator, type ScreeningResponse,
} from '@erp/contracts';
import { RequestId } from '../common/request-id';
import { ScreeningRepository } from './screening.repository';

export class ScreeningConditionDto {
  @ApiProperty({ example: 'NET_MARGIN' })
  @Matches(/^[A-Z_]{2,60}$/, { message: 'Mã chỉ số không hợp lệ' })
  metric!: string;

  @ApiProperty({ enum: SCREENING_OPERATORS, example: '>=' })
  @IsIn(SCREENING_OPERATORS as unknown as string[], { message: 'Toán tử phải là một trong >=, >, <=, <, =' })
  op!: ScreeningOperator;

  @ApiProperty({ example: 0.1, description: 'Tỷ lệ thuần: 10% gửi là 0.10' })
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Ngưỡng phải là số' })
  value!: number;
}

export class ScreeningRequestDto {
  @ApiProperty({ example: 2024 })
  @IsInt({ message: 'year phải là số nguyên' })
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  year!: number;

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
  @ApiOperation({ summary: 'S3 — Sàng lọc nhiều điều kiện AND; Oracle (pkg_screening) quyết định Đạt / Không đạt / Chưa xác định' })
  @ApiOkResponse({ description: 'Mọi doanh nghiệp, PASS trước rồi UNKNOWN, FAIL' })
  @ApiBadRequestResponse({ description: 'Đầu vào sai (kiểm tra ở API hoặc ORA-20401…20405 của Oracle)' })
  async screen(@RequestId() requestId: string, @Body() body: ScreeningRequestDto): Promise<ScreeningResponse> {
    const rows = await this.repo.screen(requestId, body.year, body.conditions);
    return { year: body.year, conditions: body.conditions, rows };
  }
}
