import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService, ValidateResult } from './users.service';

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
}
