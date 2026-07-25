import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import * as os from 'os';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { UsersService } from './users.service';

type StreamEntry = [id: string, fields: string[]];
type ReadGroupReply = [stream: string, entries: StreamEntry[]][] | null;

interface SecurityEvent {
  event_type: string;
  user_id: string;
  timestamp: string;
}

/**
 * Consume el stream `security-events` publicado por auth-service (XADD) mediante un
 * consumer group propio, para reaccionar a bloqueos de cuenta sin acoplarse a auth-service.
 *
 * Al arrancar, primero drena las entradas que este consumer dejó sin XACK en una caída
 * previa (su Pending Entries List) antes de pasar a leer entradas nuevas con `>`.
 */
@Injectable()
export class SecurityEventsConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SecurityEventsConsumer.name);
  private readonly stream = process.env.REDIS_SECURITY_EVENTS_STREAM ?? 'security-events';
  private readonly group = process.env.REDIS_SECURITY_EVENTS_GROUP ?? 'users-service';
  private readonly consumerName = `users-service-${os.hostname()}-${process.pid}`;
  private stopped = false;
  private loop: Promise<void> = Promise.resolve();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureGroup();
    await this.drainPending();
    this.loop = this.consumeLoop();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    await this.loop;
    this.redis.disconnect();
  }

  private async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', this.stream, this.group, '$', 'MKSTREAM');
      this.logger.log(`Grupo "${this.group}" creado sobre "${this.stream}"`);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('BUSYGROUP')) {
        return;
      }
      throw err;
    }
  }

  /** Reprocesa, con id `0`, las entradas ya entregadas a este consumer pero nunca confirmadas. */
  private async drainPending(): Promise<void> {
    let cursor = '0';
    for (;;) {
      const reply = (await this.redis.xreadgroup(
        'GROUP',
        this.group,
        this.consumerName,
        'COUNT',
        50,
        'STREAMS',
        this.stream,
        cursor,
      )) as ReadGroupReply;
      const entries = reply?.[0]?.[1] ?? [];
      if (entries.length === 0) {
        return;
      }
      for (const [id, fields] of entries) {
        await this.handleEntry(id, fields);
        cursor = id;
      }
      if (entries.length < 50) {
        return;
      }
    }
  }

  private async consumeLoop(): Promise<void> {
    while (!this.stopped) {
      let reply: ReadGroupReply;
      try {
        reply = (await this.redis.xreadgroup(
          'GROUP',
          this.group,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          5000,
          'STREAMS',
          this.stream,
          '>',
        )) as ReadGroupReply;
      } catch (err) {
        this.logger.error('Error leyendo security-events, reintentando en 1s', err as Error);
        await this.sleep(1000);
        continue;
      }
      const entries = reply?.[0]?.[1] ?? [];
      for (const [id, fields] of entries) {
        await this.handleEntry(id, fields);
      }
    }
  }

  private async handleEntry(id: string, fields: string[]): Promise<void> {
    const event = this.parseFields(fields);
    try {
      await this.applyEffect(event);
      await this.redis.xack(this.stream, this.group, id);
    } catch (err) {
      // No se confirma: la entrada queda en el PEL y se reintenta en el próximo
      // arranque (drainPending) o en un XAUTOCLAIM externo si el consumer no vuelve.
      this.logger.error(
        `No se pudo aplicar el evento ${id} (${event.event_type} de ${event.user_id}); ` +
          'queda pendiente para reintentar',
        err as Error,
      );
    }
  }

  private async applyEffect(event: SecurityEvent): Promise<void> {
    switch (event.event_type) {
      case 'user.locked': {
        const applied = await this.usersService.markSecurityLocked(event.user_id, true);
        if (!applied) {
          this.logger.warn(`user.locked de un user_id inexistente: ${event.user_id}`);
        }
        return;
      }
      case 'user.login_failed':
        this.logger.debug(`Intento de login fallido para ${event.user_id}`);
        return;
      default:
        this.logger.warn(`Tipo de evento de seguridad desconocido: ${event.event_type}`);
    }
  }

  private parseFields(fields: string[]): SecurityEvent {
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]] = fields[i + 1];
    }
    return {
      event_type: map.event_type,
      user_id: map.user_id,
      timestamp: map.timestamp,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
