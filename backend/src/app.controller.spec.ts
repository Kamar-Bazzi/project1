import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  const countUsers = jest.fn();

  beforeEach(async () => {
    countUsers.mockReset();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            user: {
              count: countUsers,
            },
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('returns the API status', () => {
      expect(appController.getHome()).toEqual({
        message: 'Medical Tracking API is running',
      });
    });
  });

  describe('database check', () => {
    it('returns the current user count', async () => {
      countUsers.mockResolvedValue(3);

      await expect(appController.checkDatabase()).resolves.toEqual({
        success: true,
        message: 'PostgreSQL connection successful',
        usersCount: 3,
      });

      expect(countUsers).toHaveBeenCalledTimes(1);
    });
  });
});
