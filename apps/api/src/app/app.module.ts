import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RequestIdMiddleware } from '../common/request-id';
import { HealthModule } from '../health/health.module';
import { CompaniesModule } from '../companies/companies.module';
import { ReportsModule } from '../reports/reports.module';
import { MetricsModule } from '../metrics/metrics.module';
import { ScreeningModule } from '../screening/screening.module';
import { ImportsModule } from '../imports/imports.module';

@Module({
  imports: [DatabaseModule, HealthModule, CompaniesModule, ReportsModule, MetricsModule, ScreeningModule, ImportsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
