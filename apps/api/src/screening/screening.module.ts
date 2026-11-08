import { Module } from '@nestjs/common';
import { ScreeningController } from './screening.controller';
import { ScreeningRepository } from './screening.repository';

@Module({ controllers: [ScreeningController], providers: [ScreeningRepository] })
export class ScreeningModule {}
