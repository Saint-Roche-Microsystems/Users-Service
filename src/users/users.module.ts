import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InternalUsersController } from './internal-users.controller';
import { UsersController } from './users.controller';
import { UsersMessagesController } from './users.messages.controller';
import { UsersService } from './users.service';
import { AuthClient } from './auth.client';
import { User, UserSchema } from './schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UsersController, UsersMessagesController, InternalUsersController],
  providers: [UsersService, AuthClient],
  exports: [UsersService],
})
export class UsersModule {}
