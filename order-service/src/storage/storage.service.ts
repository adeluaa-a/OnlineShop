
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { Order } from '../orders/order.entity';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly bucketName = 'cold-storage';
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      endpoint: this.configService.get<string>(
        'S3_ENDPOINT',
        'http://localhost:8333',
      ),
      region: this.configService.get<string>('S3_REGION', 'us-east-1'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.configService.get<string>(
          'S3_ACCESS_KEY',
          'admin',
        ),
        secretAccessKey: this.configService.get<string>(
          'S3_SECRET_KEY',
          'key',
        ),
      },
    });
  }

  async onModuleInit() {
    await this.ensureBucket();
    console.log('SeaweedFS object storage connected');
  }

  private async ensureBucket() {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.bucketName,
        }),
      );

      console.log(`S3 bucket exists: ${this.bucketName}`);
    } catch {
      await this.s3Client.send(
        new CreateBucketCommand({
          Bucket: this.bucketName,
        }),
      );

      console.log(`S3 bucket created: ${this.bucketName}`);
    }
  }

  async archiveOrder(order: Order) {
    const year = new Date(order.createdAt).getFullYear();
    const objectKey = `orders/${year}/order-${order.id}.json`;
    const content = JSON.stringify(order, null, 2);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        Body: content,
        ContentType: 'application/json',
      }),
    );

    console.log(`ORDER ARCHIVED: ${objectKey}`);

    return {
      bucket: this.bucketName,
      objectKey,
    };
  }
}