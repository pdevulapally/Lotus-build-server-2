import { IsString, Length } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @Length(1, 200)
  title!: string;
}
