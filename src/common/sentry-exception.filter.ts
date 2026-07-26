import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      // Solo 5xx va a Sentry: los 4xx son flujo normal, mismo criterio que
      // domain_error_handler en los servicios FastAPI.
      Sentry.withScope((scope) => {
        scope.setTag('service', 'users-service');
        scope.setTag('transport', 'http');
        scope.setTag('failure_mode', 'fail-closed');
        const requestId = request.headers['x-request-id'];
        if (requestId) scope.setTag('request_id', String(requestId));
        Sentry.captureException(exception);
      });
    }

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: status, message: 'Internal server error' };
    response.status(status).json(body);
  }
}
