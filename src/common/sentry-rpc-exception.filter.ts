import { ArgumentsHost, Catch, RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';
import * as Sentry from '@sentry/node';

@Catch()
export class SentryRpcExceptionFilter implements RpcExceptionFilter<unknown> {
  catch(exception: unknown, _host: ArgumentsHost): Observable<unknown> {
    Sentry.withScope((scope) => {
      scope.setTag('service', 'users-service');
      scope.setTag('transport', 'tcp');
      scope.setTag('failure_mode', 'fail-closed');
      Sentry.captureException(exception);
    });
    // Devolver la *carga* del RpcException, no la instancia: es lo que hace el filtro por
    // defecto de Nest (`BaseRpcExceptionFilter`), y al sustituirlo por éste el error
    // llegaba al cliente envuelto (`err.error.code`) en vez de tal cual (`err.code`).
    // El consumidor programa contra la carga, así que la forma del error es contrato.
    if (exception instanceof RpcException) {
      return throwError(() => exception.getError());
    }
    return throwError(() => exception);
  }
}
