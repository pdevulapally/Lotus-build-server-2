import { SessionStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export class ListSessionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
}
