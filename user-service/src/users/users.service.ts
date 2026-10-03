import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(data: {
    email: string;
    password: string;
    name: string;
  }) {
    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = this.usersRepository.create({
      email: data.email,
      passwordHash,
      name: data.name,
    });

    const savedUser = await this.usersRepository.save(user);

    return {
      id: savedUser.id,
      email: savedUser.email,
      name: savedUser.name,
      createdAt: savedUser.createdAt,
    };
  }

  async findAll() {
    return this.usersRepository.find({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });
  }
}