import { ArgumentsHost, Catch, RpcExceptionFilter } from '@nestjs/common';
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
    return throwError(() => exception);
  }
}
