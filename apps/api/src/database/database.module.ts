import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config/app-config';
import { OracleService } from './oracle.service';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }, OracleService],
  exports: [APP_CONFIG, OracleService],
})
export class DatabaseModule {}
