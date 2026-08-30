import { Controller, Get, NotFoundException } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    const record = await this.usersService.getById(user.id);
    if (!record) {
      throw new NotFoundException('User not found');
    }
    return {
      id: record.id,
      email: record.email,
      name: record.name,
      createdAt: record.createdAt,
    };
  }
}
