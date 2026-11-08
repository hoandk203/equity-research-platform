import { createParamDecorator, ExecutionContext, Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, REQUEST_ID_PATTERN } from '@erp/contracts';

export type RequestWithId = Request & { requestId: string };

/** Accepts a well-formed X-Request-Id from the client or generates one; echoes it back. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : `req-${randomUUID()}`;
    (req as RequestWithId).requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}

export const RequestId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<RequestWithId>();
  return req.requestId ?? 'no-request-id';
});
