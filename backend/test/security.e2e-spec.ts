import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { API_PREFIX, configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

const JWT_SECRET = 'security-e2e-secret-with-at-least-32-characters';
const PATIENT_A_USER_ID = '10000000-0000-4000-8000-000000000001';
const PATIENT_B_USER_ID = '10000000-0000-4000-8000-000000000002';
const DOCTOR_USER_ID = '10000000-0000-4000-8000-000000000003';
const ADMIN_USER_ID = '10000000-0000-4000-8000-000000000004';
const DOCTOR_ID = '40000000-0000-4000-8000-000000000003';
const PATIENT_A_ID = '20000000-0000-4000-8000-000000000001';
const PATIENT_B_ID = '20000000-0000-4000-8000-000000000002';
const FOREIGN_MEASUREMENT_ID = '30000000-0000-4000-8000-000000000002';
const FOREIGN_APPOINTMENT_ID = '50000000-0000-4000-8000-000000000002';
const FOREIGN_NOTIFICATION_ID = '60000000-0000-4000-8000-000000000002';
const FOREIGN_SUBSCRIPTION_ID = '70000000-0000-4000-8000-000000000002';
const FOREIGN_SESSION_ID = '80000000-0000-4000-8000-000000000002';
const FOREIGN_GOAL_ID = '90000000-0000-4000-8000-000000000002';
const FOREIGN_NOTE_ID = 'a0000000-0000-4000-8000-000000000002';

interface FindUniqueArguments {
  where: {
    id?: string;
    userId?: string;
    email?: string;
  };
}

interface MeasurementFindFirstArguments {
  where: {
    id?: string;
    patientId?: string;
  };
}

describe('Security controls (e2e)', () => {
  jest.setTimeout(45_000);

  let app: INestApplication<App>;
  let jwtService: JwtService;
  const originalEnvironment = {
    jwtSecret: process.env.JWT_SECRET,
    swaggerEnabled: process.env.SWAGGER_ENABLED,
  };

  const users = new Map([
    [
      PATIENT_A_USER_ID,
      {
        id: PATIENT_A_USER_ID,
        name: 'Patient A',
        email: 'patient-a@example.test',
        role: UserRole.PATIENT,
        accountStatus: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
        passwordChangedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    [
      PATIENT_B_USER_ID,
      {
        id: PATIENT_B_USER_ID,
        name: 'Patient B',
        email: 'patient-b@example.test',
        role: UserRole.PATIENT,
        accountStatus: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date('2026-01-02T00:00:00.000Z'),
        passwordChangedAt: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ],
    [
      DOCTOR_USER_ID,
      {
        id: DOCTOR_USER_ID,
        name: 'Doctor',
        email: 'doctor@example.test',
        role: UserRole.DOCTOR,
        accountStatus: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date('2026-01-03T00:00:00.000Z'),
        passwordChangedAt: null,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    ],
    [
      ADMIN_USER_ID,
      {
        id: ADMIN_USER_ID,
        name: 'Administrator',
        email: 'admin@example.test',
        role: UserRole.ADMIN,
        accountStatus: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date('2026-01-04T00:00:00.000Z'),
        passwordChangedAt: null,
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    ],
  ]);

  const prismaMock = {
    user: {
      findUnique: jest.fn(({ where }: FindUniqueArguments) => {
        if (where.id) {
          return users.get(where.id) ?? null;
        }

        return null;
      }),
      count: jest.fn(),
    },
    patient: {
      findUnique: jest.fn(({ where }: FindUniqueArguments) => {
        if (where.userId === PATIENT_A_USER_ID) {
          return { id: PATIENT_A_ID };
        }

        if (where.userId === PATIENT_B_USER_ID) {
          return { id: PATIENT_B_ID };
        }

        return null;
      }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    doctor: {
      findUnique: jest.fn(({ where }: FindUniqueArguments) => {
        if (where.userId === DOCTOR_USER_ID) {
          return {
            id: DOCTOR_ID,
            userId: DOCTOR_USER_ID,
            specialization: 'General medicine',
            licenseNumber: 'TEST-DOCTOR',
            createdAt: new Date('2026-01-03T00:00:00.000Z'),
            updatedAt: new Date('2026-01-03T00:00:00.000Z'),
            user: users.get(DOCTOR_USER_ID),
          };
        }

        return null;
      }),
    },
    measurement: {
      findFirst: jest.fn(({ where }: MeasurementFindFirstArguments) => {
        if (
          where.id === FOREIGN_MEASUREMENT_ID &&
          where.patientId === PATIENT_B_ID
        ) {
          return {
            id: FOREIGN_MEASUREMENT_ID,
            patientId: PATIENT_B_ID,
          };
        }

        return null;
      }),
    },
    appointment: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    notification: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn(),
    },
    pushSubscription: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    authSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    healthGoal: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.SWAGGER_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    jwtService = new JwtService({ secret: JWT_SECRET });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    restoreEnvironmentVariable('JWT_SECRET', originalEnvironment.jwtSecret);
    restoreEnvironmentVariable(
      'SWAGGER_ENABLED',
      originalEnvironment.swaggerEnabled,
    );
  });

  describe('JWT integrity and authorization', () => {
    it('rejects an expired JWT', async () => {
      const expiredToken = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: -1 },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a JWT whose payload was modified after signing', async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );
      const modifiedToken = alterTokenRoleWithoutSigning(token, UserRole.ADMIN);

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${modifiedToken}`)
        .expect(401);

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('uses the current database role instead of a privileged JWT role claim', async () => {
      const escalatedClaimToken = await jwtService.signAsync(
        {
          ...patientPayload(PATIENT_A_USER_ID),
          role: UserRole.ADMIN,
        },
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/admin/users`)
        .set('Authorization', `Bearer ${escalatedClaimToken}`)
        .expect(403);

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PATIENT_A_USER_ID } }),
      );
    });

    it('rejects access tokens for deleted users', async () => {
      const deletedUserToken = await jwtService.signAsync(
        patientPayload('10000000-0000-4000-8000-000000000099'),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${deletedUserToken}`)
        .expect(401);
    });
  });

  describe('object-level authorization', () => {
    it("does not reveal another patient's measurement", async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/measurements/${FOREIGN_MEASUREMENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(prismaMock.measurement.findFirst).toHaveBeenCalledWith({
        where: {
          id: FOREIGN_MEASUREMENT_ID,
          patientId: PATIENT_A_ID,
        },
      });
    });

    it('blocks a doctor from patient-only clinical routes', async () => {
      const doctorToken = await jwtService.signAsync(
        {
          sub: DOCTOR_USER_ID,
          email: 'doctor@example.test',
          role: UserRole.DOCTOR,
        },
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/measurements`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(403);

      expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
    });

    it('does not reveal a patient who is not actively assigned to the doctor', async () => {
      const doctorToken = await jwtService.signAsync(
        {
          sub: DOCTOR_USER_ID,
          email: 'doctor@example.test',
          role: UserRole.DOCTOR,
        },
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/doctor/patients/${PATIENT_B_ID}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(404);

      expect(prismaMock.patient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: PATIENT_B_ID,
            doctorAccessGrants: {
              some: { doctorId: DOCTOR_ID, active: true },
            },
          },
        }),
      );
    });

    it('applies the active-assignment check to the new medical-history route', async () => {
      const doctorToken = await jwtService.signAsync(
        rolePayload(DOCTOR_USER_ID, 'doctor@example.test', UserRole.DOCTOR),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/doctor/patients/${PATIENT_B_ID}/medical-history`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(404);

      expect(prismaMock.patient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: PATIENT_B_ID,
            doctorAccessGrants: {
              some: { doctorId: DOCTOR_ID, active: true },
            },
          },
        }),
      );
    });

    it("does not reveal another patient's appointment", async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/appointments/${FOREIGN_APPOINTMENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(prismaMock.appointment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: FOREIGN_APPOINTMENT_ID,
            AND: [{ patient: { userId: PATIENT_A_USER_ID } }],
          },
        }),
      );
    });

    it("does not mark another user's notification as read", async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .patch(`/${API_PREFIX}/notifications/${FOREIGN_NOTIFICATION_ID}/read`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: FOREIGN_NOTIFICATION_ID,
          userId: PATIENT_A_USER_ID,
        },
        data: { readAt: expect.any(Date) as Date },
      });
    });

    it("does not revoke another user's push subscription", async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .delete(
          `/${API_PREFIX}/notifications/push-subscriptions/${FOREIGN_SUBSCRIPTION_ID}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(prismaMock.pushSubscription.updateMany).toHaveBeenCalledWith({
        where: {
          id: FOREIGN_SUBSCRIPTION_ID,
          userId: PATIENT_A_USER_ID,
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('scopes session revocation to the authenticated user', async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .delete(`/${API_PREFIX}/auth/sessions/${FOREIGN_SESSION_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(prismaMock.authSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: FOREIGN_SESSION_ID,
          userId: PATIENT_A_USER_ID,
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it("does not reveal another patient's health goal", async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/health-goals/${FOREIGN_GOAL_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(prismaMock.healthGoal.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: FOREIGN_GOAL_ID, patientId: PATIENT_A_ID },
        }),
      );
    });
  });

  describe('route-level role boundaries', () => {
    it.each([
      ['get', 'admin/dashboard'],
      ['get', 'admin/roles'],
      ['get', 'admin/users'],
      ['get', `admin/users/${PATIENT_B_USER_ID}`],
      ['post', 'admin/users'],
      ['patch', `admin/users/${PATIENT_B_USER_ID}`],
      ['delete', `admin/users/${PATIENT_B_USER_ID}`],
      ['get', 'admin/doctors'],
      ['get', 'admin/assignments'],
      ['post', 'admin/assignments'],
      ['delete', `admin/assignments/${DOCTOR_ID}/${PATIENT_B_ID}`],
      ['get', 'admin/audit-logs'],
    ] as const)('blocks a patient from %s /%s', async (method, path) => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );
      const call = securityRequest(app, method, `/${API_PREFIX}/${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      await call.expect(403);
    });

    it.each([
      ['get', 'doctor/dashboard'],
      ['get', 'doctor/patients'],
      ['get', `doctor/patients/${PATIENT_B_ID}`],
      ['get', 'doctor/alerts'],
      ['get', 'doctor/appointments'],
      ['get', 'doctor/monitoring'],
      ['get', `doctor/patients/${PATIENT_B_ID}/notes`],
      ['post', `doctor/patients/${PATIENT_B_ID}/notes`],
      ['patch', `doctor/patients/${PATIENT_B_ID}/notes/${FOREIGN_NOTE_ID}`],
      ['get', `doctor/patients/${PATIENT_B_ID}/follow-ups`],
      ['post', `doctor/patients/${PATIENT_B_ID}/follow-ups`],
      ['get', `doctor/patients/${PATIENT_B_ID}/medical-history`],
      ['get', `doctor/patients/${PATIENT_B_ID}/goals`],
      ['get', `doctor/patients/${PATIENT_B_ID}/monitoring`],
    ] as const)('blocks a patient from %s /%s', async (method, path) => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await securityRequest(app, method, `/${API_PREFIX}/${path}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    const patientOnlyRoutes = [
      ['get', 'medical-history'],
      ['get', 'medical-records/notes'],
      ['get', 'medical-records/follow-ups'],
      ['get', 'health-goals'],
      ['get', `health-goals/${FOREIGN_GOAL_ID}`],
      ['post', 'health-goals'],
      ['patch', `health-goals/${FOREIGN_GOAL_ID}`],
      ['delete', `health-goals/${FOREIGN_GOAL_ID}`],
      ['post', `health-goals/${FOREIGN_GOAL_ID}/progress`],
      ['get', 'emergency-events'],
      ['post', 'emergency-events'],
      ['patch', `emergency-events/${FOREIGN_GOAL_ID}/resolve`],
      ['get', 'reports/health'],
      ['get', 'reports/health/export'],
    ] as const;

    it.each(patientOnlyRoutes)(
      'blocks a doctor from patient route %s /%s',
      async (method, path) => {
        const token = await jwtService.signAsync(
          rolePayload(DOCTOR_USER_ID, 'doctor@example.test', UserRole.DOCTOR),
          { expiresIn: '15m' },
        );

        await securityRequest(app, method, `/${API_PREFIX}/${path}`)
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(403);
      },
    );

    it.each(patientOnlyRoutes)(
      'blocks an administrator from patient route %s /%s',
      async (method, path) => {
        const token = await jwtService.signAsync(
          rolePayload(ADMIN_USER_ID, 'admin@example.test', UserRole.ADMIN),
          { expiresIn: '15m' },
        );

        await securityRequest(app, method, `/${API_PREFIX}/${path}`)
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(403);
      },
    );

    it.each([
      ['get', 'doctor/monitoring'],
      ['get', `doctor/patients/${PATIENT_B_ID}/notes`],
      ['post', `doctor/patients/${PATIENT_B_ID}/notes`],
      ['patch', `doctor/patients/${PATIENT_B_ID}/notes/${FOREIGN_NOTE_ID}`],
      ['get', `doctor/patients/${PATIENT_B_ID}/follow-ups`],
      ['post', `doctor/patients/${PATIENT_B_ID}/follow-ups`],
      ['get', `doctor/patients/${PATIENT_B_ID}/medical-history`],
      ['get', `doctor/patients/${PATIENT_B_ID}/goals`],
      ['get', `doctor/patients/${PATIENT_B_ID}/monitoring`],
    ] as const)(
      'blocks an administrator from doctor route %s /%s',
      async (method, path) => {
        const token = await jwtService.signAsync(
          rolePayload(ADMIN_USER_ID, 'admin@example.test', UserRole.ADMIN),
          { expiresIn: '15m' },
        );

        await securityRequest(app, method, `/${API_PREFIX}/${path}`)
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(403);
      },
    );

    it.each([
      'appointments',
      'doctor/dashboard',
      'admin/dashboard',
      'notifications',
      'medical-history',
      'doctor/monitoring',
      'reports/health',
      'exports/measurements?format=csv',
    ])('requires authentication for /%s', (path) =>
      request(app.getHttpServer()).get(`/${API_PREFIX}/${path}`).expect(401),
    );
  });

  describe('malformed and mass-assignment payloads', () => {
    it('rejects attempts to self-register an administrator role', () => {
      return request(app.getHttpServer())
        .post(`/${API_PREFIX}/auth/register`)
        .send({
          name: 'Role Escalation',
          email: 'escalation@example.test',
          password: 'ValidPass1',
          role: UserRole.ADMIN,
        })
        .expect(400);
    });

    it('rejects a client-supplied patientId on a patient-owned resource', async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .post(`/${API_PREFIX}/measurements`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId: PATIENT_B_ID,
          type: 'HEART_RATE',
          value: 75,
          unit: 'bpm',
          measuredAt: '2026-08-14T12:00:00.000Z',
        })
        .expect(400);

      expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
    });

    it('rejects malformed resource identifiers before querying storage', async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/measurements/not-a-uuid`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.measurement.findFirst).not.toHaveBeenCalled();
    });

    it('rejects malformed appointment timestamps before authorization queries', async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .post(`/${API_PREFIX}/appointments`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          doctorId: DOCTOR_ID,
          appointmentDate: 'tomorrow morning',
        })
        .expect(400);

      expect(prismaMock.appointment.findFirst).not.toHaveBeenCalled();
    });

    it('rejects malformed administrator assignment payloads', async () => {
      const token = await jwtService.signAsync(
        {
          sub: ADMIN_USER_ID,
          email: 'admin@example.test',
          role: UserRole.ADMIN,
        },
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .post(`/${API_PREFIX}/admin/assignments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ doctorId: 'not-a-uuid', patientId: PATIENT_B_ID })
        .expect(400);
    });

    it('rejects malformed doctor pagination before patient queries', async () => {
      const token = await jwtService.signAsync(
        {
          sub: DOCTOR_USER_ID,
          email: 'doctor@example.test',
          role: UserRole.DOCTOR,
        },
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/doctor/patients?page=0&pageSize=101`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(prismaMock.doctor.findUnique).not.toHaveBeenCalled();
    });

    it('rejects malformed web-push subscription credentials', async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .post(`/${API_PREFIX}/notifications/push-subscriptions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          endpoint: 'javascript:alert(1)',
          keys: { p256dh: 'short', auth: 'short' },
        })
        .expect(400);
    });

    it('rejects attempts by a patient to select an export patientId', async () => {
      const token = await jwtService.signAsync(
        patientPayload(PATIENT_A_USER_ID),
        { expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(
          `/${API_PREFIX}/exports/measurements?format=csv&patientId=${PATIENT_B_ID}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['medical-history?page=0&period=999', 'get', undefined],
      [
        'emergency-events',
        'post',
        { note: 'Synthetic test', latitude: 100, longitude: 0 },
      ],
      ['reports/health?period=365', 'get', undefined],
      ['exports/not-a-dataset?format=csv', 'get', undefined],
    ] as const)(
      'rejects malformed new clinical input at /%s',
      async (path, method, body) => {
        const token = await jwtService.signAsync(
          patientPayload(PATIENT_A_USER_ID),
          { expiresIn: '15m' },
        );
        const call = securityRequest(app, method, `/${API_PREFIX}/${path}`).set(
          'Authorization',
          `Bearer ${token}`,
        );

        if (body !== undefined) call.send(body);
        await call.expect(400);
      },
    );

    it.each([
      ['auth/reset-password', { token: 'short', password: 'weak' }],
      ['auth/email-verification/confirm', { token: 42 }],
      ['auth/email-verification/resend', { email: 'not-an-email' }],
    ])('rejects malformed public payloads at /%s', (path, body) =>
      request(app.getHttpServer())
        .post(`/${API_PREFIX}/${path}`)
        .send(body)
        .expect(400),
    );
  });

  it('enforces the tighter login rate limit', async () => {
    for (let requestNumber = 1; requestNumber <= 5; requestNumber += 1) {
      await request(app.getHttpServer())
        .post(`/${API_PREFIX}/auth/login`)
        .send({ email: 'unknown@example.test', password: 'ValidPass1' })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/login`)
      .send({ email: 'unknown@example.test', password: 'ValidPass1' })
      .expect(429);
  });

  it('enforces the configured 120 requests per minute limit', async () => {
    for (let requestNumber = 1; requestNumber <= 120; requestNumber += 1) {
      await request(app.getHttpServer()).get(`/${API_PREFIX}`).expect(200);
    }

    await request(app.getHttpServer()).get(`/${API_PREFIX}`).expect(429);
  });
});

function patientPayload(userId: string) {
  return rolePayload(userId, 'patient-a@example.test', UserRole.PATIENT);
}

function rolePayload(userId: string, email: string, role: UserRole) {
  return { sub: userId, email, role };
}

function alterTokenRoleWithoutSigning(token: string, role: UserRole): string {
  const [header, encodedPayload, signature] = token.split('.');
  const payload = JSON.parse(
    Buffer.from(encodedPayload, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
  const modifiedPayload = Buffer.from(
    JSON.stringify({ ...payload, role }),
    'utf8',
  ).toString('base64url');

  return `${header}.${modifiedPayload}.${signature}`;
}

function restoreEnvironmentVariable(
  name: string,
  originalValue: string | undefined,
): void {
  if (originalValue === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = originalValue;
}

function securityRequest(
  app: INestApplication<App>,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
) {
  const client = request(app.getHttpServer());

  switch (method) {
    case 'get':
      return client.get(path);
    case 'post':
      return client.post(path);
    case 'patch':
      return client.patch(path);
    case 'delete':
      return client.delete(path);
  }
}
