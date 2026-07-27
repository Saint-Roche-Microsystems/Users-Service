import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateActiveDto } from './dto/update-active.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import {
  PaginatedUsersDto,
  UserResponseDto,
} from './dto/user-response.dto';

/**
 * CRUD/administración de usuarios, equivalente a los endpoints del monolito
 * (listar, obtener, activar/desactivar) más cambio de rol.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get()
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('page_size', new DefaultValuePipe(20), ParseIntPipe)
    pageSize: number,
  ): Promise<PaginatedUsersDto> {
    return this.usersService.list(page, pageSize);
  }

  // Antes de `:id`: el gateway resuelve la identidad del JWT en X-User-Id, así que "me"
  // no debe matchear como si fuera un id de Mongo (NestJS resuelve rutas en orden de
  // declaración dentro del mismo prefijo).
  @Get('me')
  getSelf(
    @Headers('x-user-id') userId: string | undefined,
  ): Promise<UserResponseDto> {
    if (!userId) {
      throw new UnauthorizedException('Falta la cabecera X-User-Id.');
    }
    return this.usersService.getById(userId);
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.getById(id);
  }

  @Patch(':id/active')
  setActive(
    @Param('id') id: string,
    @Body() dto: UpdateActiveDto,
  ): Promise<UserResponseDto> {
    return this.usersService.setActive(id, dto.active);
  }

  @Patch(':id/role')
  setRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<UserResponseDto> {
    return this.usersService.setRole(id, dto.role);
  }
}
