
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from './order.entity';
import { KafkaService } from '../kafka/kafka.service';
import { StorageService } from '../storage/storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    HttpModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, KafkaService, StorageService],
})
export class OrdersModule {}