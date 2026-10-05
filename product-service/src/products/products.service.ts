import {
  BadRequestException,
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
      url: process.env.REDIS_URL || 'redis://localhost:6379',
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
    const cachedProduct = await this.redisClient.get(cacheKey);

    if (cachedProduct) {
      console.log(`REDIS CACHE HIT: ${cacheKey}`);
      return JSON.parse(cachedProduct);
    }

    console.log(`REDIS CACHE MISS: ${cacheKey}`);

    const product = await this.productModel.findById(id).lean();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.redisClient.set(
      cacheKey,
      JSON.stringify(product),
      { EX: 300 },
    );

    console.log(`REDIS CACHE SET: ${cacheKey}`);

    return product;
  }

  async reserveStock(id: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException(
        'Quantity must be a positive integer',
      );
    }

    const product = await this.productModel
      .findOneAndUpdate(
        {
          _id: id,
          stock: { $gte: quantity },
        },
        {
          $inc: { stock: -quantity },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!product) {
      const exists = await this.productModel.exists({ _id: id });

      if (!exists) {
        throw new NotFoundException('Product not found');
      }

      throw new BadRequestException('Insufficient product stock');
    }

    await this.redisClient.del(`product:${id}`);

    return product;
  }

  async releaseStock(id: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException(
        'Quantity must be a positive integer',
      );
    }

    const product = await this.productModel
      .findByIdAndUpdate(
        id,
        {
          $inc: { stock: quantity },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.redisClient.del(`product:${id}`);

    return product;
  }
}

