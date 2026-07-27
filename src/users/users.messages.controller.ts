import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { isValidObjectId } from 'mongoose';
import {
  UserProfileResult,
  UsersService,
  ValidateResult,
} from './users.service';

/**
 * Códigos de error del contrato TCP. Son parte del contrato, igual que la forma de la
 * respuesta: el consumidor programa contra ellos y los traduce a su propio dominio (y,
 * al final de la cadena, a un código HTTP). Los nombres son los de gRPC porque es la
 * convención que el curso usa para el transporte síncrono con contrato.
 */
export const RPC_INVALID_ARGUMENT = 'INVALID_ARGUMENT';
export const RPC_NOT_FOUND = 'NOT_FOUND';

/**
 * Transporte TCP: contrato consumible por otros servicios sin pasar por el HTTP
 * público (p. ej. bets-service valida usuarios sin acoplarse al gateway).
 */
@Controller()
export class UsersMessagesController {
  private readonly logger = new Logger(UsersMessagesController.name);

  constructor(private readonly usersService: UsersService) {}

  @MessagePattern('users.validate')
  validate(
    @Payload() data: { user_id: string; request_id?: string },
  ): Promise<ValidateResult> {
    // request_id viaja desde bets-service (hop A->B) para poder correlacionar este
    // frame TCP con el resto de la cadena (gateway -> HTTP -> aquí -> auth-service).
    this.logger.log(`users.validate user_id=${data?.user_id} request_id=${data?.request_id}`);
    return this.usersService.validate(data?.user_id, data?.request_id);
  }

  /**
   * Perfil de identidad de un usuario. Lo consume progression-service, que muestra el
   * `username` en estadísticas y ranking y calcula la antigüedad de la cuenta con
   * `created_at`, sin quedarse una copia de la colección `users` (de la que no es dueño).
   *
   * A diferencia de `users.validate`, aquí el usuario inexistente **no** se degrada a una
   * respuesta "vacía": se señala con un error tipado para que el consumidor pueda
   * traducirlo a 404 en vez de pintar una fila con el nombre en blanco.
   */
  @MessagePattern('users.profile')
  async profile(
    @Payload() data: { user_id: string; request_id?: string },
  ): Promise<UserProfileResult> {
    const userId = data?.user_id;
    this.logger.log(`users.profile user_id=${userId} request_id=${data?.request_id}`);

    // Validación de entrada antes de tocar Mongo: un id ausente o con formato que no es
    // ObjectId es culpa de quien llama, no un recurso que falta.
    if (typeof userId !== 'string' || !isValidObjectId(userId)) {
      throw new RpcException({
        code: RPC_INVALID_ARGUMENT,
        message: 'user_id ausente o con formato inválido.',
      });
    }

    const profile = await this.usersService.getProfile(userId);
    if (!profile) {
      throw new RpcException({
        code: RPC_NOT_FOUND,
        message: 'Usuario no encontrado.',
      });
    }
    return profile;
  }
}
