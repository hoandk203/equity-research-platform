import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { MetricsController } from './metrics.controller';
import { MetricsRepository } from './metrics.repository';
import { MetricsService } from './metrics.service';

@Module({
  imports: [CompaniesModule],
  controllers: [MetricsController],
  providers: [MetricsRepository, MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
