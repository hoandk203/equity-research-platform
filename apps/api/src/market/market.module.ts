import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { MarketController } from './market.controller';
import { MarketRepository } from './market.repository';
import { MarketService } from './market.service';

@Module({
  imports: [CompaniesModule],
  controllers: [MarketController],
  providers: [MarketRepository, MarketService],
  exports: [MarketService],
})
export class MarketModule {}
