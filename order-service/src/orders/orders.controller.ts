import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';

import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @Body()
    body: {
      userId: number;
      productId: string;
      quantity: number;
      totalPrice: number;
    },
  ) {
    return this.ordersService.create(body);
  }

  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
  }

  @Post(':id/archive')
  async archive(
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.ordersService.archiveOrder(id);

    if (!result) {
      throw new NotFoundException('Order not found');
    }

    return {
      message: 'Order archived successfully',
      ...result,
    };
  }
}