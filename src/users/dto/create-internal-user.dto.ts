import { IsEmail, IsEnum, IsMongoId, IsString, MinLength } from 'class-validator';
import { Role } from '../schemas/user.schema';

/** Alta de perfil propagada desde auth-service tras un registro (POST /internal/users). */
export class CreateInternalUserDto {
  @IsMongoId()
  user_id: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsEnum(Role)
  role: Role;
}
