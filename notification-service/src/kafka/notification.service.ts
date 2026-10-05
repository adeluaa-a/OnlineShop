import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Consumer, Kafka } from 'kafkajs';

@Injectable()
export class NotificationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly consumer: Consumer;

  constructor() {
    const kafka = new Kafka({
      clientId: 'notification-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    });

    this.consumer = kafka.consumer({
      groupId: 'notification-service',
    });
  }

  async onModuleInit() {
    await this.consumer.connect();

    await this.consumer.subscribe({
      topic: 'orders.events',
      fromBeginning: true,
    });

    console.log('Kafka consumer connected');

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }

        const event = JSON.parse(message.value.toString());

        console.log('NOTIFICATION EVENT RECEIVED:');
        console.log(event);

        if (event.eventType === 'OrderCreated') {
          console.log(
            `NOTIFICATION: Order #${event.payload.id} has been created`,
          );
        }
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
