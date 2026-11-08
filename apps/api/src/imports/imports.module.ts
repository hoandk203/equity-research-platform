import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';

@Module({ controllers: [ImportsController], providers: [ImportsRepository] })
export class ImportsModule {}
