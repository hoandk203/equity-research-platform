import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpErrorFilter } from '../common/http-exception.filter';
import type { AppConfig } from '../config/app-config';

export const GLOBAL_PREFIX = 'api';

/** Shared by main.ts and the API tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.enableCors({ origin: config.corsOrigins, methods: ['GET', 'POST'], exposedHeaders: ['X-Request-Id'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  if (config.swagger) {
    const doc = new DocumentBuilder()
      .setTitle('Equity Research Platform API')
      .setDescription(
        'API chỉ đọc trên Oracle AI Database 26ai. Mọi truy vấn chạy bằng tài khoản ERP_APP; ' +
          'quy tắc nghiệp vụ (chỉ số, sàng lọc) nằm trong Oracle. Số tiền VND trả dạng chuỗi; tỷ lệ trả dạng số.',
      )
      .setVersion('1.0')
      .build();
    SwaggerModule.setup(`${GLOBAL_PREFIX}/docs`, app, SwaggerModule.createDocument(app, doc), { jsonDocumentUrl: `${GLOBAL_PREFIX}/docs-json` });
  }
}
