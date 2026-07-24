import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalKeyGuard } from '../internal/internal-key.guard';
import { CreateInternalUserDto } from './dto/create-internal-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

/**
 * Alta de perfil servicio-a-servicio: la llama auth-service tras un registro exitoso
 * (ver `HttpUsersClient.create_profile` en auth-service), para propagar el perfil con el
 * mismo `user_id` que la credencial recién creada.
 */
@Controller('internal/users')
@UseGuards(InternalKeyGuard)
export class InternalUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateInternalUserDto): Promise<UserResponseDto> {
    return this.usersService.createWithId(dto);
  }
}
