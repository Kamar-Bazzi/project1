import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { API_PREFIX, configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = originalJwtSecret ?? 'e2e-test-only-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          count: jest.fn(),
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get(`/${API_PREFIX}`)
      .expect(200)
      .expect({ message: 'Medical Tracking API is running' });
  });

  it('/api/v1/auth/register (POST) rejects malformed input', () => {
    return request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/register`)
      .send({
        name: 'Test Patient',
        email: 42,
        password: 'ValidPass1',
      })
      .expect(400);
  });

  it('/api/v1/database-check (GET) requires authentication', () => {
    return request(app.getHttpServer())
      .get(`/${API_PREFIX}/database-check`)
      .expect(401);
  });

  afterAll(async () => {
    await app.close();

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });
});
