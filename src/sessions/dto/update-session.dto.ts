import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { SessionStatus } from '@prisma/client';

export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
}
