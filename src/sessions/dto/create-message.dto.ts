import { IsEnum, IsString, Length } from 'class-validator';
import { MessageRole } from '@prisma/client';

export class CreateMessageDto {
  @IsEnum(MessageRole)
  role!: MessageRole;

  @IsString()
  @Length(1, 20000)
  content!: string;
}
