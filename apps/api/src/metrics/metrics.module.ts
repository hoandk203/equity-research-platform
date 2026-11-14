import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { MarketModule } from '../market/market.module';
import { MetricsController } from './metrics.controller';
import { MetricsRepository } from './metrics.repository';
import { MetricsService } from './metrics.service';

@Module({
  imports: [CompaniesModule, MarketModule],
  controllers: [MetricsController],
  providers: [MetricsRepository, MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
