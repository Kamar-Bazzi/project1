import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthMetricType, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { API_PREFIX, configureApp } from '../src/configure-app';
import { HealthMetricsService } from '../src/health-metrics/health-metrics.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Wearable health security and validation (e2e)', () => {
  let app: INestApplication<App>;
  let patientToken: string;
  let doctorToken: string;
  const originalJwtSecret = process.env.JWT_SECRET;
  const testJwtSecret = 'wearable-e2e-test-only-secret-value';
  const deviceId = '11aa22bb-33cc-44dd-88ee-112233445566';
  const syncForPatient = jest.fn();
  const syncDemoForPatient = jest.fn();
  const createForPatient = jest.fn();

  beforeAll(async () => {
    process.env.JWT_SECRET = testJwtSecret;

    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(2),
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve({
            id: where.id,
            name: where.id === 'doctor-user' ? 'Doctor' : 'Patient',
            email:
              where.id === 'doctor-user'
                ? 'doctor@example.com'
                : 'patient@example.com',
            role:
              where.id === 'doctor-user' ? UserRole.DOCTOR : UserRole.PATIENT,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        ),
      },
    };
    const healthMetrics = {
      findAllForPatient: jest.fn().mockResolvedValue([]),
      findLatestForPatient: jest.fn().mockResolvedValue([]),
      findHistoryForPatient: jest.fn().mockResolvedValue([]),
      createForPatient,
      syncForPatient,
      syncDemoForPatient,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(HealthMetricsService)
      .useValue(healthMetrics)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const jwtService = new JwtService({ secret: testJwtSecret });
    patientToken = await jwtService.signAsync({
      sub: 'patient-user',
      email: 'patient@example.com',
      role: UserRole.PATIENT,
    });
    doctorToken = await jwtService.signAsync({
      sub: 'doctor-user',
      email: 'doctor@example.com',
      role: UserRole.DOCTOR,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    syncForPatient.mockResolvedValue({
      receivedCount: 1,
      createdCount: 1,
      duplicateCount: 0,
      lastSyncAt: new Date('2026-08-08T10:00:01.000Z'),
      metrics: [],
    });
    syncDemoForPatient.mockResolvedValue({
      receivedCount: 7,
      createdCount: 7,
      duplicateCount: 0,
      lastSyncAt: new Date('2026-08-08T10:00:01.000Z'),
      metrics: [],
    });
  });

  it.each([
    'health-metrics',
    'wearables',
    'health-alerts',
    'alert-rules',
    'emergency-contacts',
  ])('rejects unauthenticated access to /%s', async (path) => {
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/${path}`)
      .expect(401);
  });

  it('rejects an invalid JWT', async () => {
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/health-metrics`)
      .set('Authorization', 'Bearer this.is.not-a-valid-jwt')
      .expect(401);
  });

  it('rejects doctor role access when no patient assignment view exists', async () => {
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/health-metrics`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);
  });

  it('rejects an invalid metric enum before calling the service', async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/health-metrics`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        metricType: 'MOOD',
        value: 5,
        unit: 'score',
        measuredAt: '2026-08-08T10:00:00.000Z',
      })
      .expect(400);

    expect(createForPatient).not.toHaveBeenCalled();
  });

  it('rejects an invalid metric timestamp before calling the service', async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/health-metrics`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        metricType: HealthMetricType.HEART_RATE,
        value: 75,
        unit: 'bpm',
        measuredAt: 'not-a-timestamp',
      })
      .expect(400);

    expect(createForPatient).not.toHaveBeenCalled();
  });

  it('forbids patientId in a synchronization payload', async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/health-metrics/sync`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patientId: 'patient-b',
        wearableDeviceId: deviceId,
        measurements: [
          {
            metricType: HealthMetricType.STEPS,
            value: 1_000,
            unit: 'count',
            measuredAt: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      })
      .expect(400);

    expect(syncForPatient).not.toHaveBeenCalled();
  });

  it.each([
    {
      method: 'patch' as const,
      path: `wearables/${deviceId}`,
      body: { active: null },
    },
    {
      method: 'post' as const,
      path: 'alert-rules',
      body: {
        metricType: HealthMetricType.HEART_RATE,
        maximumValue: 120,
        enabled: null,
      },
    },
    {
      method: 'post' as const,
      path: 'emergency-contacts',
      body: {
        name: 'Contact',
        relationship: 'Friend',
        phone: '+961 70 123 456',
        active: null,
      },
    },
  ])(
    'rejects null for non-null optional fields at /$path',
    async ({ method, path, body }) => {
      await request(app.getHttpServer())
        [method](`/${API_PREFIX}/${path}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send(body)
        .expect(400);
    },
  );

  it('accepts a validated synchronization batch for the JWT patient', async () => {
    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/health-metrics/sync`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        wearableDeviceId: deviceId,
        measurements: [
          {
            metricType: HealthMetricType.STEPS,
            value: 1_000,
            unit: 'count',
            measuredAt: new Date(Date.now() - 60_000).toISOString(),
            externalRecordId: 'provider-record-1',
          },
        ],
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        receivedCount: 1,
        createdCount: 1,
        duplicateCount: 0,
      }),
    );
    expect(syncForPatient).toHaveBeenCalledWith(
      'patient-user',
      expect.objectContaining({ wearableDeviceId: deviceId }),
    );
  });

  it('routes demo generation through the authenticated demo sync endpoint', async () => {
    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/health-metrics/demo-sync`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ wearableDeviceId: deviceId })
      .expect(201);

    expect(response.text).toContain('"createdCount":7');

    expect(syncDemoForPatient).toHaveBeenCalledWith('patient-user', deviceId);
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
