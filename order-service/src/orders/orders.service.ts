import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Order } from './order.entity';
import { KafkaService } from '../kafka/kafka.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly kafkaService: KafkaService,
    private readonly storageService: StorageService,
  ) {}

  async create(data: {
    userId: number;
    productId: string;
    quantity: number;
    totalPrice: number;
  }) {
    const order = this.ordersRepository.create({
      userId: data.userId,
      productId: data.productId,
      quantity: data.quantity,
      totalPrice: data.totalPrice,
      status: 'CREATED',
    });

    const savedOrder = await this.ordersRepository.save(order);

    await this.kafkaService.publishOrderCreated(savedOrder);

    return savedOrder;
  }

  async findAll() {
    return this.ordersRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: number) {
    return this.ordersRepository.findOneBy({ id });
  }

  async archiveOrder(id: number) {
    const order = await this.ordersRepository.findOneBy({ id });

    if (!order) {
      return null;
    }

    return this.storageService.archiveOrder(order);
  }
}