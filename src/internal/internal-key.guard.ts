import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/**
 * Exige el secreto de servicio compartido en las rutas `/internal/*`, igual que
 * auth-service y bets-service: sin él, cualquiera que alcance el servicio podría dar de
 * alta perfiles con un `user_id` arbitrario.
 */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = process.env.INTERNAL_API_KEY ?? '';
    const provided = request.header('x-internal-key') ?? '';

    if (!expected || !this.matches(expected, provided)) {
      throw new UnauthorizedException('Secreto de servicio inválido o ausente.');
    }
    return true;
  }

  private matches(expected: string, provided: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
