import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { OrdersService } from './orders.service';

describe('OrdersService stock reservation', () => {
  let service: OrdersService;

  let ordersRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOneBy: jest.Mock;
  };

  let kafkaService: {
    publishOrderCreated: jest.Mock;
  };

  let storageService: {
    archiveOrder: jest.Mock;
  };

  let httpService: {
    get: jest.Mock;
    post: jest.Mock;
  };

  const product = {
    _id: '6abe85453ebf5514c67419e6',
    name: 'Laptop',
    price: 799.99,
    stock: 8,
  };

  const orderData = {
    userId: 1,
    productId: '6abe85453ebf5514c67419e6',
    quantity: 2,
  };

  beforeEach(() => {
    ordersRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((data) =>
        Promise.resolve({ id: 100, ...data }),
      ),
      find: jest.fn(),
      findOneBy: jest.fn(),
    };

    kafkaService = {
      publishOrderCreated: jest.fn().mockResolvedValue(undefined),
    };

    storageService = {
      archiveOrder: jest.fn(),
    };

    httpService = {
      get: jest.fn().mockReturnValue(
        of({ data: { ...product, stock: 10 } }),
      ),
      post: jest.fn().mockImplementation((url: string) => {
        if (url.endsWith('/reserve')) {
          return of({ data: product });
        }

        return of({ data: product });
      }),
    };

    service = new OrdersService(
      ordersRepository as any,
      kafkaService as any,
      storageService as any,
      httpService as any,
    );
  });

  it('reserves stock, saves the order and publishes Kafka event', async () => {
    const result = await service.create(orderData);

    expect(httpService.post).toHaveBeenCalledWith(
      `http://localhost:3001/products/${orderData.productId}/reserve`,
      { quantity: 2 },
    );

    expect(ordersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        productId: orderData.productId,
        quantity: 2,
        totalPrice: 1599.98,
        status: 'CREATED',
      }),
    );

    expect(kafkaService.publishOrderCreated).toHaveBeenCalledWith(
      result,
    );
  });

  it('releases stock if saving the order fails', async () => {
    const databaseError = new Error('Database unavailable');

    ordersRepository.save.mockRejectedValueOnce(databaseError);

    await expect(service.create(orderData)).rejects.toThrow(
      'Database unavailable',
    );

    expect(httpService.post).toHaveBeenCalledWith(
      `http://localhost:3001/products/${orderData.productId}/release`,
      { quantity: 2 },
    );

    expect(kafkaService.publishOrderCreated).not.toHaveBeenCalled();
  });

  it('does not create an order when stock reservation fails', async () => {
    httpService.post.mockImplementation((url: string) => {
      if (url.endsWith('/reserve')) {
        return throwError(
          () => ({
            response: {
              status: 400,
              data: { message: 'Insufficient product stock' },
            },
          }),
        );
      }

      return of({ data: product });
    });

    await expect(service.create(orderData)).rejects.toThrow(
      BadRequestException,
    );

    expect(ordersRepository.save).not.toHaveBeenCalled();
    expect(kafkaService.publishOrderCreated).not.toHaveBeenCalled();
  });

  it('returns service unavailable if reservation service is unavailable', async () => {
    httpService.post.mockReturnValue(
      throwError(() => new Error('Connection refused')),
    );

    await expect(service.create(orderData)).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(ordersRepository.save).not.toHaveBeenCalled();
  });

  it('rejects invalid quantity before making HTTP requests', async () => {
    await expect(
      service.create({ ...orderData, quantity: 0 }),
    ).rejects.toThrow(BadRequestException);

    expect(httpService.get).not.toHaveBeenCalled();
    expect(httpService.post).not.toHaveBeenCalled();
  });
});
