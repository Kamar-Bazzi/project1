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
  const originalSwaggerEnabled = process.env.SWAGGER_ENABLED;

  beforeAll(async () => {
    process.env.JWT_SECRET = originalJwtSecret ?? 'e2e-test-only-secret';
    process.env.SWAGGER_ENABLED = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: jest.fn().mockResolvedValue([{ ready: 1 }]),
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
      .expect('Cache-Control', 'no-store')
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

  it('/api/v1/health (GET) checks API and database readiness', () => {
    return request(app.getHttpServer())
      .get(`/${API_PREFIX}/health`)
      .expect(200)
      .expect('X-Request-Id', /^[0-9a-f-]{36}$/)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({ status: 'ok', database: 'up' }),
        );
      });
  });

  it('/api/v1/docs/openapi.json exposes tagged authentication requirements', async () => {
    const response = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/docs/openapi.json`)
      .expect(200);
    interface DocumentedOperation {
      summary?: string;
      description?: string;
      tags?: string[];
      security?: Array<Record<string, string[]>>;
      parameters?: Array<{
        $ref?: string;
        name?: string;
        description?: string;
      }>;
      requestBody?: {
        content?: Record<string, { schema?: { $ref?: string; type?: string } }>;
      };
      responses?: Record<
        string,
        {
          $ref?: string;
          description?: string;
          content?: Record<string, unknown>;
        }
      >;
      'x-required-roles'?: string[];
      'x-resource-scope'?: string;
    }

    const document = response.body as {
      info: { title: string };
      paths: Record<string, Record<string, DocumentedOperation>>;
      components: {
        schemas: Record<
          string,
          {
            properties?: Record<string, { description?: string }>;
          }
        >;
      };
    };

    expect(document.info.title).toBe('Medical Tracking API');
    expect(document.paths[`/${API_PREFIX}/auth/login`].post.security).toEqual(
      [],
    );
    expect(
      document.paths[`/${API_PREFIX}/auth/email-verification/resend`].post
        .security,
    ).toEqual([]);
    expect(document.paths[`/${API_PREFIX}/auth/refresh`].post.security).toEqual(
      [{ 'refresh-cookie': [] }],
    );
    expect(document.paths[`/${API_PREFIX}/auth/logout`].post).toEqual(
      expect.objectContaining({
        security: [{ 'refresh-cookie': [] }, {}],
        'x-required-roles': [],
      }),
    );
    expect(
      document.paths[`/${API_PREFIX}/auth/logout`].post.responses?.['401'],
    ).toBeUndefined();
    expect(document.paths[`/${API_PREFIX}/admin/users`].get).toEqual(
      expect.objectContaining({
        tags: ['admin'],
        security: [{ 'access-token': [] }],
        'x-required-roles': ['ADMIN'],
      }),
    );
    const healthOperation = document.paths[`/${API_PREFIX}/health`].get;
    expect(healthOperation.security).toEqual([]);
    expect(healthOperation['x-required-roles']).toEqual([]);
    expect(healthOperation.responses?.['503']?.description).toBe(
      'The API is running but PostgreSQL is unavailable.',
    );
    const doctorHistoryOperation =
      document.paths[
        `/${API_PREFIX}/doctor/patients/{patientId}/medical-history`
      ].get;
    expect(doctorHistoryOperation.tags).toEqual(['doctor']);
    expect(doctorHistoryOperation.security).toEqual([{ 'access-token': [] }]);
    expect(doctorHistoryOperation['x-required-roles']).toEqual(['DOCTOR']);
    expect(doctorHistoryOperation['x-resource-scope']).toContain(
      'active assignment',
    );
    const exportOperation =
      document.paths[`/${API_PREFIX}/exports/{dataset}`].get;
    expect(exportOperation.tags).toEqual(['patient', 'doctor', 'admin']);
    expect(exportOperation['x-required-roles']).toEqual([
      'PATIENT',
      'DOCTOR',
      'ADMIN',
    ]);

    const documentedBodyOperations = [
      document.paths[`/${API_PREFIX}/appointments`].post,
      document.paths[`/${API_PREFIX}/auth/password`].patch,
      document.paths[`/${API_PREFIX}/notifications/preferences`].patch,
      document.paths[`/${API_PREFIX}/doctor/patients/{patientId}/notes`].post,
      document.paths[`/${API_PREFIX}/health-goals`].post,
      document.paths[`/${API_PREFIX}/emergency-events`].post,
    ];
    for (const operation of documentedBodyOperations) {
      const bodySchema =
        operation.requestBody?.content?.['application/json']?.schema;
      expect(bodySchema?.$ref ?? bodySchema?.type).toBeTruthy();
    }

    const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
    for (const pathItem of Object.values(document.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!methods.has(method)) continue;
        expect(operation.summary).toBeTruthy();
        expect(operation.description).toBeTruthy();
        expect(operation.tags?.length).toBeGreaterThan(0);
        expect(operation.security).toBeDefined();
        expect(operation['x-required-roles']).toBeDefined();
        expect(operation['x-resource-scope']).toBeTruthy();

        const responses = operation.responses ?? {};
        expect(responses['429']).toBeDefined();
        expect(
          Object.keys(responses).some((code) => /^2\d\d$/.test(code)),
        ).toBe(true);
        for (const documentedResponse of Object.values(responses)) {
          if (documentedResponse.$ref) continue;
          expect(documentedResponse.description).toBeTruthy();
        }

        if (
          operation.security?.some((requirement) =>
            Object.hasOwn(requirement, 'access-token'),
          )
        ) {
          expect(responses['401']).toBeDefined();
          expect(responses['403']).toBeDefined();
          expect(responses['429']).toBeDefined();
        }

        for (const parameter of operation.parameters ?? []) {
          if (parameter.$ref) continue;
          expect(parameter.description).toBeTruthy();
        }
      }
    }

    expect(
      document.components.schemas.ApiError.properties?.statusCode.description,
    ).toBeTruthy();
    expect(
      document.components.schemas.ApiError.properties?.message.description,
    ).toBeTruthy();
    for (const schema of Object.values(document.components.schemas)) {
      for (const property of Object.values(schema.properties ?? {})) {
        expect(property.description).toBeTruthy();
      }
    }
  });

  afterAll(async () => {
    await app.close();

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }

    if (originalSwaggerEnabled === undefined) {
      delete process.env.SWAGGER_ENABLED;
    } else {
      process.env.SWAGGER_ENABLED = originalSwaggerEnabled;
    }
  });
});
