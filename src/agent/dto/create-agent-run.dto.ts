import { IsString, Length } from 'class-validator';

export class CreateAgentRunDto {
  @IsString()
  @Length(1, 20000)
  prompt!: string;
}
