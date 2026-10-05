import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

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
    private readonly httpService: HttpService,
  ) {}

  async create(data: {
    userId: number;
    productId: string;
    quantity: number;
  }) {
    if (!Number.isInteger(data.userId) || data.userId <= 0) {
      throw new BadRequestException('Invalid userId');
    }

    if (
      !Number.isInteger(data.quantity) ||
      data.quantity <= 0
    ) {
      throw new BadRequestException(
        'Quantity must be a positive integer',
      );
    }

    // 1. Получаем данные товара и его цену.
    let product: { price: number };

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `http://localhost:3001/products/${data.productId}`,
        ),
      );

      product = response.data;
    } catch {
      throw new BadRequestException(
        'Product not found or product-service unavailable',
      );
    }

    if (
      typeof product.price !== 'number' ||
      !Number.isFinite(product.price) ||
      product.price < 0
    ) {
      throw new BadRequestException('Invalid product price');
    }

    // 2. Атомарно резервируем товар на складе.
    let reserved = false;
    let reservedProduct: { price: number };

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `http://localhost:3001/products/${data.productId}/reserve`,
          { quantity: data.quantity },
        ),
      );

      reservedProduct = response.data;
      reserved = true;
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          data?: { message?: string };
        };
      };

      const status = err.response?.status;
      const message = err.response?.data?.message;

      if (status === 400) {
        throw new BadRequestException(
          message || 'Insufficient product stock',
        );
      }

      if (status === 404) {
        throw new BadRequestException('Product not found');
      }

      throw new ServiceUnavailableException(
        'Could not reserve product stock',
      );
    }

    // 3. Используем цену из ответа резервирования.
    // Если цена некорректна, возвращаем товар на склад.
    if (
      typeof reservedProduct.price !== 'number' ||
      !Number.isFinite(reservedProduct.price) ||
      reservedProduct.price < 0
    ) {
      try {
        await firstValueFrom(
          this.httpService.post(
            `http://localhost:3001/products/${data.productId}/release`,
            { quantity: data.quantity },
          ),
        );
      } catch (error) {
        console.error(
          'CRITICAL: Could not release reserved stock after invalid price',
          error,
        );
      }

      throw new BadRequestException('Invalid product price');
    }

    const totalPrice =
      Math.round(
        reservedProduct.price * data.quantity * 100,
      ) / 100;

    // 4. Сохраняем заказ. При ошибке возвращаем товар на склад.
    let savedOrder: Order;

    try {
      const order = this.ordersRepository.create({
        userId: data.userId,
        productId: data.productId,
        quantity: data.quantity,
        totalPrice,
        status: 'CREATED',
      });

      savedOrder = await this.ordersRepository.save(order);
    } catch (error) {
      if (reserved) {
        try {
          await firstValueFrom(
            this.httpService.post(
              `http://localhost:3001/products/${data.productId}/release`,
              { quantity: data.quantity },
            ),
          );
        } catch (releaseError) {
          console.error(
            'CRITICAL: Order save failed and reserved stock could not be released',
            releaseError,
          );
        }
      }

      throw error;
    }

    // 5. Публикуем событие после успешного сохранения заказа.
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
