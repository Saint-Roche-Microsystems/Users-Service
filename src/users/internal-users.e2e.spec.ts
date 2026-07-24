import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import request from 'supertest';
import { UsersModule } from './users.module';

const INTERNAL_KEY = 'test-internal-key';

/**
 * Verifica el alta de perfil servicio-a-servicio (`POST /internal/users`), el contrato
 * que auth-service invoca tras un registro para propagar el mismo `user_id`.
 */
describe('POST /internal/users (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_KEY;
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongod.getUri()), UsersModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  const server = () => app.getHttpServer();

  it('rechaza sin X-Internal-Key', async () => {
    await request(server())
      .post('/internal/users')
      .send({
        user_id: new Types.ObjectId().toString(),
        username: 'nokey',
        email: 'nokey@fijazo.com',
        role: 'USER',
      })
      .expect(401);
  });

  it('crea el perfil con el user_id exacto que envía auth-service', async () => {
    const userId = new Types.ObjectId().toString();

    const created = await request(server())
      .post('/internal/users')
      .set('X-Internal-Key', INTERNAL_KEY)
      .send({ user_id: userId, username: 'synced', email: 'synced@fijazo.com', role: 'USER' })
      .expect(201);

    expect(created.body.id).toBe(userId);
    expect(created.body.username).toBe('synced');
    expect(created.body.active).toBe(true);

    const fetched = await request(server()).get(`/users/${userId}`).expect(200);
    expect(fetched.body.id).toBe(userId);
  });

  it('rechaza email/username duplicado con 409', async () => {
    const userId1 = new Types.ObjectId().toString();
    await request(server())
      .post('/internal/users')
      .set('X-Internal-Key', INTERNAL_KEY)
      .send({ user_id: userId1, username: 'dup', email: 'dup@fijazo.com', role: 'USER' })
      .expect(201);

    const userId2 = new Types.ObjectId().toString();
    await request(server())
      .post('/internal/users')
      .set('X-Internal-Key', INTERNAL_KEY)
      .send({ user_id: userId2, username: 'dup', email: 'dup@fijazo.com', role: 'USER' })
      .expect(409);
  });
});
