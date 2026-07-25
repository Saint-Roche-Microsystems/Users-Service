import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Conexión Redis compartida por este servicio, hacia el Redis global.
 */
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => new Redis(process.env.REDIS_URI ?? 'redis://localhost:6379/0'),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
