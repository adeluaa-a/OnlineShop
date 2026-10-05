import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer;

  constructor() {
    const kafka = new Kafka({
      clientId: 'order-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    });

    this.producer = kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
    console.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async publishOrderCreated(order: unknown) {
    await this.producer.send({
      topic: 'orders.events',
      messages: [
        {
          value: JSON.stringify({
            eventType: 'OrderCreated',
            occurredAt: new Date().toISOString(),
            payload: order,
          }),
        },
      ],
    });

    console.log('Kafka event published: OrderCreated');
  }
}
