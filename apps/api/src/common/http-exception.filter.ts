import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody } from '@erp/contracts';
import { mapOracleError } from '../database/oracle-errors';
import type { RequestWithId } from './request-id';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  429: 'TOO_MANY_REQUESTS',
};

/**
 * Single error format for every response. Oracle details and stack traces are logged on the
 * server only; clients receive a stable code, a Vietnamese message and the request id.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();
    const requestId = req.requestId ?? 'no-request-id';
    const http = exception instanceof HttpException ? exception : mapOracleError(exception);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    const body: ApiErrorBody = { error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống. Vui lòng thử lại sau.', requestId } };
    if (http) {
      status = http.getStatus();
      const payload = http.getResponse();
      body.error.code = DEFAULT_CODES[status] ?? `HTTP_${status}`;
      if (typeof payload === 'object' && payload !== null) {
        const p = payload as { code?: string; message?: string | string[] };
        if (p.code) body.error.code = p.code;
        if (Array.isArray(p.message)) {
          body.error.code = p.code ?? 'VALIDATION_FAILED';
          body.error.message = 'Dữ liệu gửi lên không hợp lệ.';
          body.error.details = p.message;
        } else if (p.message) {
          body.error.message = status === 404 && p.message.startsWith('Cannot ') ? 'Không tìm thấy đường dẫn.' : p.message;
        }
      } else if (typeof payload === 'string') {
        body.error.message = payload;
      }
    }
    if (status >= 500) {
      this.logger.error(`[${requestId}] ${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(status).json(body);
  }
}
