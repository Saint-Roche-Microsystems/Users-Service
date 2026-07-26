import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

/** Estado de bloqueo devuelto por auth-service (`/internal/lock-status/:id`). */
export interface LockStatus {
  locked: boolean;
  locked_until: string | null;
}

/**
 * Cliente del hop B->C: consulta a auth-service el estado de bloqueo de una cuenta
 * usando el secreto de servicio `X-Internal-Key`. No expone la existencia de
 * auth-service al llamador (Bets).
 */
@Injectable()
export class AuthClient {
  private readonly logger = new Logger(AuthClient.name);

  private get baseUrl(): string {
    return process.env.AUTH_SERVICE_URL ?? 'http://localhost:8001';
  }

  private get internalKey(): string {
    return process.env.INTERNAL_API_KEY ?? '';
  }

  async getLockStatus(userId: string, requestId?: string): Promise<LockStatus> {
    const url = `${this.baseUrl}/internal/lock-status/${encodeURIComponent(userId)}`;
    try {
      const headers: Record<string, string> = { 'X-Internal-Key': this.internalKey };
      // Propaga el X-Request-Id de la request original.
      if (requestId) headers['X-Request-Id'] = requestId;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        // Sin credencial (404) o error: la cuenta no se considera bloqueada.
        this.logger.warn(
          `lock-status ${res.status} para ${userId}; se asume no bloqueada`,
        );
        Sentry.withScope((scope) => {
          scope.setTag('service', 'users-service');
          scope.setTag('transport', 'http');
          scope.setTag('failure_mode', 'fail-open');
          if (requestId) scope.setTag('request_id', requestId);
          scope.setContext('lock_status_check', { user_id: userId, http_status: res.status });
          Sentry.captureMessage(
            `lock-status ${res.status} de auth-service; se asume no bloqueada`,
            'warning',
          );
        });
        return { locked: false, locked_until: null };
      }
      const data = (await res.json()) as {
        locked?: boolean;
        locked_until?: string | null;
      };
      return {
        locked: Boolean(data.locked),
        locked_until: data.locked_until ?? null,
      };
    } catch (err) {
      this.logger.warn(
        `auth-service inalcanzable para ${userId}: ${String(err)}; se asume no bloqueada`,
      );
      Sentry.withScope((scope) => {
        scope.setTag('service', 'users-service');
        scope.setTag('transport', 'http');
        scope.setTag('failure_mode', 'fail-open');
        if (requestId) scope.setTag('request_id', requestId);
        scope.setContext('lock_status_check', { user_id: userId });
        Sentry.captureException(err);
      });
      return { locked: false, locked_until: null };
    }
  }
}
