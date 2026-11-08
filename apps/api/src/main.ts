import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { configureApp, GLOBAL_PREFIX } from './app/setup';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { loadEnvFile } from './config/env-file';

async function bootstrap() {
  loadEnvFile();
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  await app.listen(config.port);
  if (process.env['NX_READY_SIGNAL_SOCKET']) {
    try {
      const load = new Function('s', 'return import(s)') as (s: string) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js not installed (e.g. production image)
    }
  }
  Logger.log(`API http://localhost:${config.port}/${GLOBAL_PREFIX} · docs /${GLOBAL_PREFIX}/docs`);
}

bootstrap().catch((err) => {
  Logger.error(err instanceof Error ? err.message : String(err), 'Bootstrap');
  process.exit(1);
});
