import * as net from 'net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { Transport } from '@nestjs/microservices';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { SentryRpcExceptionFilter } from '../common/sentry-rpc-exception.filter';
import { UsersModule } from './users.module';

const TCP_PORT = 3097;

/**
 * Contrato TCP `users.profile`: perfil de identidad para servicios que no son dueños de
 * la colección `users` (progression-service).
 *
 * Se habla por socket crudo, no con `ClientProxy`, porque el consumidor real es un
 * cliente Python (`progression-service`) que implementa el framing `<longitud>#<json>` a
 * mano: lo que hay que fijar aquí es **la forma exacta del frame** —incluidos los errores
 * tipados—, no que Nest se entienda consigo mismo. El filtro global del microservicio es
 * el mismo que registra `main.ts:26`, para que el error viaje por el camino real.
 */
describe('users.profile (contrato TCP)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let userId: string;

  beforeAll(async () => {
    process.env.INTERNAL_API_KEY = 'test-internal-key';

    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongod.getUri()), UsersModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    const tcp = app.connectMicroservice({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: TCP_PORT },
    });
    tcp.useGlobalFilters(new SentryRpcExceptionFilter());
    await app.startAllMicroservices();
    await app.init();

    const created = await request(app.getHttpServer())
      .post('/users')
      .send({
        username: 'ranked',
        email: 'ranked@fijazo.com',
        password: 'secret123',
      })
      .expect(201);
    userId = created.body.id;
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  /** Envía un frame `<longitud>#<json>` y devuelve el frame de respuesta ya parseado. */
  function call(pattern: string, data: unknown): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(TCP_PORT, '127.0.0.1', () => {
        const body = JSON.stringify({ pattern, id: '1', data });
        socket.write(`${Buffer.byteLength(body)}#${body}`);
      });
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const separator = buffer.indexOf('#');
        if (separator === -1) return;
        const length = parseInt(buffer.slice(0, separator), 10);
        const payload = buffer.slice(separator + 1);
        if (Buffer.byteLength(payload) < length) return;
        socket.end();
        resolve(JSON.parse(payload));
      });
      socket.on('error', reject);
    });
  }

  it('devuelve el perfil de identidad de un usuario existente', async () => {
    const frame = await call('users.profile', { user_id: userId, request_id: 'req-1' });

    expect(frame.err).toBeUndefined();
    expect(frame.response).toEqual({
      id: userId,
      username: 'ranked',
      tier: 'standard',
      role: 'USER',
      active: true,
      created_at: expect.any(String),
    });
  });

  it('no expone el email ni el hash de la contraseña', async () => {
    const frame = await call('users.profile', { user_id: userId });

    expect(Object.keys(frame.response as object).sort()).toEqual([
      'active',
      'created_at',
      'id',
      'role',
      'tier',
      'username',
    ]);
  });

  it('un usuario inexistente viaja como NOT_FOUND, no como respuesta vacía', async () => {
    const frame = await call('users.profile', {
      user_id: '6a60c83b2a0af5b4ab9745cf',
    });

    expect(frame.response).toBeUndefined();
    expect(frame.err).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('un user_id con formato inválido viaja como INVALID_ARGUMENT', async () => {
    const frame = await call('users.profile', { user_id: 'no-es-un-objectid' });

    expect(frame.err).toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('un user_id ausente viaja como INVALID_ARGUMENT', async () => {
    const frame = await call('users.profile', {});

    expect(frame.err).toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});
