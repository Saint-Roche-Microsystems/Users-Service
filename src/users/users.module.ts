import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '../redis/redis.module';
import { InternalUsersController } from './internal-users.controller';
import { SecurityEventsConsumer } from './security-events.consumer';
import { UsersController } from './users.controller';
import { UsersMessagesController } from './users.messages.controller';
import { UsersService } from './users.service';
import { AuthClient } from './auth.client';
import { User, UserSchema } from './schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    RedisModule,
  ],
  controllers: [UsersController, UsersMessagesController, InternalUsersController],
  providers: [UsersService, AuthClient, SecurityEventsConsumer],
  exports: [UsersService],
})
export class UsersModule {}
