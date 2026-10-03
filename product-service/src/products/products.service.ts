import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createClient, RedisClientType } from 'redis';

import { Product, ProductDocument } from './product.schema';

@Injectable()
export class ProductsService implements OnModuleInit, OnModuleDestroy {
  private readonly redisClient: RedisClientType;

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {
    this.redisClient = createClient({
      url: 'redis://localhost:6379',
    });

    this.redisClient.on('error', (error) => {
      console.error('Redis Client Error:', error);
    });
  }

  async onModuleInit() {
    await this.redisClient.connect();

    console.log('Redis connected');
  }

  async onModuleDestroy() {
    if (this.redisClient.isOpen) {
      await this.redisClient.quit();
    }
  }

  async create(data: {
    name: string;
    description: string;
    price: number;
    stock: number;
  }) {
    const product = new this.productModel(data);

    return product.save();
  }

  async findAll() {
    return this.productModel.find().lean();
  }

  async findOne(id: string) {
    const cacheKey = `product:${id}`;

    // Проверяем Redis
    const cachedProduct = await this.redisClient.get(cacheKey);

    console.log('REDIS VALUE:', cachedProduct);

    if (cachedProduct) {
      console.log(`REDIS CACHE HIT: ${cacheKey}`);

      return JSON.parse(cachedProduct);
    }

    // Если в Redis ничего нет — читаем MongoDB
    console.log(`REDIS CACHE MISS: ${cacheKey}`);

    const product = await this.productModel.findById(id).lean();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Сохраняем товар в Redis на 5 минут
    await this.redisClient.set(
      cacheKey,
      JSON.stringify(product),
      {
        EX: 300,
      },
    );

    console.log(`REDIS CACHE SET: ${cacheKey}`);

    return product;
  }
}