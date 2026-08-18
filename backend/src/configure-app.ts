import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

export const API_PREFIX = 'api/v1';

export function configureApp(app: INestApplication): void {
  const swaggerEnabled = process.env.SWAGGER_ENABLED !== 'false';

  app.setGlobalPrefix(API_PREFIX);

  const httpLogger = new Logger('HTTP');
  app.use((request: Request, response: Response, next: () => void) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    response.setHeader('X-Request-Id', requestId);

    if (
      process.env.NODE_ENV === 'production' ||
      process.env.HTTP_LOGGING === 'true'
    ) {
      response.on('finish', () => {
        if (!request.path.endsWith('/health')) {
          httpLogger.log(
            JSON.stringify({
              requestId,
              method: request.method,
              path: request.path,
              statusCode: response.statusCode,
              durationMs: Date.now() - startedAt,
            }),
          );
        }
      });
    }

    next();
  });

  app.use(
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Pragma', 'no-cache');
      next();
    },
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: swaggerEnabled
            ? ["'self'", "'unsafe-inline'"]
            : ["'self'"],
          styleSrc: swaggerEnabled ? ["'self'", "'unsafe-inline'"] : ["'self'"],
        },
      },
    }),
  );

  if (process.env.TRUST_PROXY === 'true') {
    const httpAdapter = app.getHttpAdapter();
    const instance = httpAdapter.getInstance() as {
      set?: (setting: string, value: number) => void;
    };
    instance.set?.('trust proxy', 1);
  }

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Medical Tracking API')
      .setDescription(
        'Role-scoped API for patients, assigned doctors, and administrators. ' +
          'Patient and doctor access is always derived from the authenticated session.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Short-lived access token returned by the authentication API',
        },
        'access-token',
      )
      .addCookieAuth(
        'caretrack_refresh',
        {
          type: 'apiKey',
          in: 'cookie',
          description:
            'Rotating refresh-token cookie; never readable by browser JavaScript',
        },
        'refresh-cookie',
      )
      .addTag('system', 'Service health and restricted operational checks')
      .addTag(
        'auth',
        'Registration, login, token rotation, and account recovery',
      )
      .addTag('patient', 'Patient-owned clinical information')
      .addTag('medications', 'Medication plans, schedules, and dose logs')
      .addTag('measurements', 'Patient-entered clinical measurements')
      .addTag('appointments', 'Role-scoped scheduling')
      .addTag('wearables', 'Devices and normalized health metrics')
      .addTag('alerts', 'Patient threshold rules and generated health alerts')
      .addTag('clinical-records', 'Medical history, notes, and follow-ups')
      .addTag('goals', 'Patient goals and progress records')
      .addTag('emergency', 'Emergency contacts and emergency-mode events')
      .addTag('reports', 'Role-scoped reports and clinical exports')
      .addTag('doctor', 'Explicitly assigned patient information')
      .addTag('admin', 'Account, assignment, and audit administration')
      .addTag('notifications', 'In-app, email, and web-push notifications')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    decorateOpenApiDocument(document);

    SwaggerModule.setup('docs', app, document, {
      useGlobalPrefix: true,
      jsonDocumentUrl: '/docs/openapi.json',
      customSiteTitle: 'Medical Tracking API documentation',
      swaggerOptions: {
        persistAuthorization: false,
        displayRequestDuration: true,
        filter: true,
      },
    });
  }
}

const PUBLIC_OPENAPI_OPERATIONS = new Set([
  `GET /${API_PREFIX}`,
  `GET /${API_PREFIX}/`,
  `GET /${API_PREFIX}/health`,
  `POST /${API_PREFIX}/auth/register`,
  `POST /${API_PREFIX}/auth/login`,
  `POST /${API_PREFIX}/auth/forgot-password`,
  `POST /${API_PREFIX}/auth/reset-password`,
  `POST /${API_PREFIX}/auth/email-verification/confirm`,
  `POST /${API_PREFIX}/auth/email-verification/resend`,
]);

const COOKIE_OPENAPI_OPERATIONS = new Set([`POST /${API_PREFIX}/auth/refresh`]);

const OPTIONAL_COOKIE_OPENAPI_OPERATIONS = new Set([
  `POST /${API_PREFIX}/auth/logout`,
]);

const OPENAPI_HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
]);

interface OpenApiOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: Array<OpenApiParameter | OpenApiReference>;
  responses?: Record<string, OpenApiResponse | OpenApiReference>;
  [extension: `x-${string}`]: unknown;
}

interface OpenApiParameter {
  name?: string;
  description?: string;
}

interface OpenApiReference {
  $ref: string;
}

interface OpenApiResponse {
  description?: string;
  content?: Record<string, unknown>;
}

interface OpenApiSchema {
  type?: string;
  description?: string;
  example?: unknown;
  properties?: Record<string, OpenApiSchema | OpenApiReference>;
  items?: OpenApiSchema | OpenApiReference;
  allOf?: Array<OpenApiSchema | OpenApiReference>;
  anyOf?: Array<OpenApiSchema | OpenApiReference>;
  oneOf?: Array<OpenApiSchema | OpenApiReference>;
}

interface OpenApiComponents {
  schemas?: Record<string, OpenApiSchema | OpenApiReference>;
}

function decorateOpenApiDocument(document: OpenAPIObject): void {
  decorateOpenApiSchemas(document);

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, candidate] of Object.entries(pathItem ?? {})) {
      if (!OPENAPI_HTTP_METHODS.has(method) || !candidate) {
        continue;
      }

      const operation = candidate as OpenApiOperation;
      const operationKey = `${method.toUpperCase()} ${path}`;

      if (!operation.tags?.length) {
        operation.tags = [openApiTagForPath(path)];
      }

      if (PUBLIC_OPENAPI_OPERATIONS.has(operationKey)) {
        operation.security = [];
      } else if (COOKIE_OPENAPI_OPERATIONS.has(operationKey)) {
        operation.security = [{ 'refresh-cookie': [] }];
      } else if (OPTIONAL_COOKIE_OPENAPI_OPERATIONS.has(operationKey)) {
        operation.security = [{ 'refresh-cookie': [] }, {}];
      } else {
        operation.security = [{ 'access-token': [] }];
      }

      const roles = openApiRolesForOperation(operationKey, path);
      operation['x-required-roles'] = roles;
      operation['x-resource-scope'] = openApiScopeForPath(path);
      if (!operation.summary?.trim()) {
        operation.summary = openApiSummary(method, path);
      }
      if (!operation.description?.trim()) {
        operation.description = openApiDescription(
          operation.summary,
          operationKey,
          path,
          roles,
        );
      }

      decorateOpenApiParameters(operation.parameters);
      decorateOpenApiResponses(operation, operationKey, method, path);
    }
  }
}

function openApiTagForPath(path: string): string {
  if (path.includes('/auth/')) return 'auth';
  if (path.includes('/admin/')) return 'admin';
  if (path.includes('/doctor/')) return 'doctor';
  if (path.includes('/appointments')) return 'appointments';
  if (path.includes('/notifications')) return 'notifications';
  if (path.includes('/medications')) return 'medications';
  if (path.includes('/measurements')) return 'measurements';
  if (path.includes('/wearables') || path.includes('/health-metrics')) {
    return 'wearables';
  }
  if (path.includes('/health-alerts') || path.includes('/alert-rules')) {
    return 'alerts';
  }
  if (path.includes('/medical-history') || path.includes('/medical-records')) {
    return 'clinical-records';
  }
  if (path.includes('/health-goals')) return 'goals';
  if (
    path.includes('/emergency-contacts') ||
    path.includes('/emergency-events')
  ) {
    return 'emergency';
  }
  if (path.includes('/reports') || path.includes('/exports')) return 'reports';
  if (path.includes('/patients') || path.includes('/clinical-records')) {
    return 'patient';
  }

  return 'system';
}

const OPENAPI_ALL_ROLES = ['PATIENT', 'DOCTOR', 'ADMIN'];

function openApiRolesForOperation(
  operationKey: string,
  path: string,
): string[] {
  if (PUBLIC_OPENAPI_OPERATIONS.has(operationKey)) return [];
  if (COOKIE_OPENAPI_OPERATIONS.has(operationKey)) return ['SESSION_COOKIE'];
  if (OPTIONAL_COOKIE_OPENAPI_OPERATIONS.has(operationKey)) return [];
  if (path.includes('/admin/') || path.endsWith('/database-check')) {
    return ['ADMIN'];
  }
  if (path.includes('/doctor/')) return ['DOCTOR'];
  if (
    path.includes('/appointments') ||
    path.includes('/notifications') ||
    path.includes('/exports') ||
    path.includes('/auth/')
  ) {
    return OPENAPI_ALL_ROLES;
  }

  return ['PATIENT'];
}

function openApiScopeForPath(path: string): string {
  if (path.includes('/admin/')) {
    return 'Current database role must be ADMIN; mutations are audited.';
  }
  if (path.includes('/doctor/patients/')) {
    return 'The current doctor must have an active assignment to the path patient.';
  }
  if (path.includes('/doctor/')) {
    return 'Results are restricted to the current doctor and active patient assignments.';
  }
  if (path.includes('/appointments')) {
    return 'Appointment scope and permitted transitions depend on the current actor role.';
  }
  if (path.includes('/notifications') || path.includes('/auth/sessions')) {
    return 'The resource must belong to the current authenticated user.';
  }
  if (path.includes('/exports')) {
    return 'Export scope is derived from the current role and never from a client-supplied owner id.';
  }
  if (openApiTagForPath(path) !== 'system' && !path.includes('/auth/')) {
    return 'The patient identity is derived from the authenticated user.';
  }

  return 'No patient record is selected by this operation.';
}

function openApiSummary(method: string, path: string): string {
  const knownSummaries: Record<string, string> = {
    [`GET /${API_PREFIX}`]: 'Check API liveness',
    [`GET /${API_PREFIX}/`]: 'Check API liveness',
    [`GET /${API_PREFIX}/health`]: 'Check API and database readiness',
    [`GET /${API_PREFIX}/database-check`]:
      'Run the restricted database connectivity check',
    [`POST /${API_PREFIX}/auth/register`]: 'Register a patient account',
    [`POST /${API_PREFIX}/auth/login`]: 'Authenticate and create a session',
    [`POST /${API_PREFIX}/auth/refresh`]: 'Rotate the refresh session',
    [`POST /${API_PREFIX}/auth/logout`]: 'Revoke the current refresh session',
    [`POST /${API_PREFIX}/auth/forgot-password`]: 'Request password recovery',
    [`POST /${API_PREFIX}/auth/reset-password`]:
      'Reset a password with a one-time token',
    [`POST /${API_PREFIX}/auth/email-verification/confirm`]:
      'Verify an email address with a one-time token',
    [`POST /${API_PREFIX}/auth/email-verification/request`]:
      'Request a new email-verification message',
    [`POST /${API_PREFIX}/auth/email-verification/resend`]:
      'Resend a non-enumerating email-verification message',
    [`GET /${API_PREFIX}/auth/sessions`]:
      'List current authentication sessions',
    [`GET /${API_PREFIX}/auth/security-events`]:
      'List current account security events',
    [`PATCH /${API_PREFIX}/auth/password`]: 'Change the current password',
    [`DELETE /${API_PREFIX}/auth/sessions/{sessionId}`]:
      'Revoke an owned authentication session',
    [`DELETE /${API_PREFIX}/auth/sessions`]:
      'Revoke all other authentication sessions',
    [`GET /${API_PREFIX}/auth/me`]: 'Get the current account',
  };
  const operationKey = `${method.toUpperCase()} ${path}`;
  if (knownSummaries[operationKey]) return knownSummaries[operationKey];

  const segments = path
    .replace(new RegExp(`^/${API_PREFIX}/?`), '')
    .split('/')
    .filter(Boolean);
  const lastSegment = segments.at(-1) ?? 'request';
  const hasPathId = lastSegment.startsWith('{');
  const resourceSegment = hasPathId
    ? (segments.at(-2) ?? lastSegment)
    : lastSegment;
  const resource = humanizeIdentifier(resourceSegment).toLowerCase();
  const verb =
    method === 'get'
      ? hasPathId
        ? 'Get'
        : 'List or get'
      : method === 'post'
        ? 'Create or start'
        : method === 'patch' || method === 'put'
          ? 'Update'
          : method === 'delete'
            ? 'Delete or revoke'
            : humanizeIdentifier(method);

  return `${verb} ${resource}`;
}

function openApiDescription(
  summary: string,
  operationKey: string,
  path: string,
  roles: string[],
): string {
  const authentication = PUBLIC_OPENAPI_OPERATIONS.has(operationKey)
    ? 'This operation is public.'
    : COOKIE_OPENAPI_OPERATIONS.has(operationKey)
      ? 'This operation requires the rotating refresh-token cookie.'
      : OPTIONAL_COOKIE_OPENAPI_OPERATIONS.has(operationKey)
        ? 'This operation accepts the rotating refresh-token cookie when present and is idempotent without it.'
        : `This operation requires a valid access token and one of these current database roles: ${roles.join(', ')}.`;

  return `${summary}. ${authentication} ${openApiScopeForPath(path)}`;
}

function decorateOpenApiParameters(
  parameters: Array<OpenApiParameter | OpenApiReference> | undefined,
): void {
  for (const parameter of parameters ?? []) {
    if (isOpenApiReference(parameter) || !parameter.name) continue;
    if (!parameter.description?.trim()) {
      parameter.description = openApiPropertyDescription(parameter.name, true);
    }
  }
}

function decorateOpenApiResponses(
  operation: OpenApiOperation,
  operationKey: string,
  method: string,
  path: string,
): void {
  operation.responses ??= {};
  const responses = operation.responses;
  const successCodes = Object.keys(responses).filter((code) =>
    /^2\d\d$/.test(code),
  );

  if (successCodes.length === 0) {
    const successCode =
      method === 'post' ? '201' : method === 'delete' ? '204' : '200';
    responses[successCode] = {
      description: openApiSuccessDescription(successCode),
    };
  } else {
    for (const code of successCodes) {
      const response = responses[code];
      if (!response || isOpenApiReference(response)) continue;
      if (!response.description?.trim()) {
        response.description = openApiSuccessDescription(code);
      }
    }
  }

  addOpenApiErrorResponse(responses, '429', 'Request rate limit exceeded.');

  if (PUBLIC_OPENAPI_OPERATIONS.has(operationKey)) {
    if (path.includes('/auth/')) {
      addOpenApiErrorResponse(
        responses,
        '400',
        'The request body is malformed or fails validation.',
      );
    }
    if (path.endsWith('/auth/login')) {
      addOpenApiErrorResponse(
        responses,
        '401',
        'Credentials are invalid or the account cannot authenticate.',
      );
    }
  } else if (!OPTIONAL_COOKIE_OPENAPI_OPERATIONS.has(operationKey)) {
    addOpenApiErrorResponse(
      responses,
      '401',
      'Authentication is absent, invalid, expired, or revoked.',
    );
    if (!COOKIE_OPENAPI_OPERATIONS.has(operationKey)) {
      addOpenApiErrorResponse(
        responses,
        '403',
        'The authenticated account does not have a permitted current role.',
      );
    }
    addOpenApiErrorResponse(
      responses,
      '400',
      'A path, query, or body value is malformed or fails validation.',
    );
  }

  if (path.includes('{')) {
    addOpenApiErrorResponse(
      responses,
      '404',
      'The resource does not exist in the caller permitted scope.',
    );
  }
  if (openApiOperationCanConflict(operationKey, method, path)) {
    addOpenApiErrorResponse(
      responses,
      '409',
      'The requested resource or state transition conflicts with current state.',
    );
  }
  if (operationKey === `GET /${API_PREFIX}/health`) {
    addOpenApiErrorResponse(
      responses,
      '503',
      'The API is running but PostgreSQL is unavailable.',
    );
  }
}

function openApiOperationCanConflict(
  operationKey: string,
  method: string,
  path: string,
): boolean {
  if (operationKey === `POST /${API_PREFIX}/auth/register`) return true;
  if (
    path.includes('/appointments') &&
    (method === 'post' || method === 'patch')
  ) {
    return true;
  }

  return (
    method === 'post' &&
    (path.includes('/admin/assignments') ||
      path.includes('/admin/users') ||
      path.includes('/alert-rules') ||
      path.includes('/emergency-events') ||
      path.includes('/wearables'))
  );
}

function addOpenApiErrorResponse(
  responses: Record<string, OpenApiResponse | OpenApiReference>,
  code: string,
  description: string,
): void {
  const errorContent = {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiError' },
    },
  };
  const existing = responses[code];
  if (!existing) {
    responses[code] = { description, content: errorContent };
    return;
  }
  if (isOpenApiReference(existing)) return;
  if (!existing.description?.trim()) existing.description = description;
  existing.content ??= errorContent;
}

function openApiSuccessDescription(code: string): string {
  if (code === '201') return 'The resource was created successfully.';
  if (code === '202') return 'The request was accepted for processing.';
  if (code === '204') return 'The request succeeded with no response body.';
  return 'The request completed successfully.';
}

function decorateOpenApiSchemas(document: OpenAPIObject): void {
  const components = document.components as OpenApiComponents;
  components.schemas ??= {};
  components.schemas.ApiError = {
    type: 'object',
    description: 'Standard JSON error response returned by the API.',
    properties: {
      statusCode: {
        type: 'integer',
        description: 'HTTP status code.',
        example: 400,
      },
      message: {
        type: 'string',
        description: 'Safe error message or validation-message list.',
        example: 'Request validation failed',
      },
      error: {
        type: 'string',
        description: 'HTTP error category when supplied by the framework.',
        example: 'Bad Request',
      },
    },
  };

  for (const [schemaName, schema] of Object.entries(components.schemas)) {
    if (isOpenApiReference(schema)) continue;
    if (!schema.description?.trim()) {
      schema.description = `${humanizeIdentifier(schemaName)} schema.`;
    }
    decorateOpenApiSchema(schema);
  }
}

function decorateOpenApiSchema(schema: OpenApiSchema): void {
  for (const [propertyName, property] of Object.entries(
    schema.properties ?? {},
  )) {
    if (isOpenApiReference(property)) continue;
    if (!property.description?.trim()) {
      property.description = openApiPropertyDescription(propertyName, false);
    }
    const example = OPENAPI_PROPERTY_EXAMPLES[propertyName];
    if (property.example === undefined && example !== undefined) {
      property.example = example;
    }
    decorateOpenApiSchema(property);
  }

  const childSchemas = [
    schema.items,
    ...(schema.allOf ?? []),
    ...(schema.anyOf ?? []),
    ...(schema.oneOf ?? []),
  ];
  for (const child of childSchemas) {
    if (!child || isOpenApiReference(child)) continue;
    decorateOpenApiSchema(child);
  }
}

function isOpenApiReference(
  value: OpenApiReference | OpenApiSchema | OpenApiParameter | OpenApiResponse,
): value is OpenApiReference {
  return '$ref' in value;
}

const OPENAPI_PROPERTY_DESCRIPTIONS: Record<string, string> = {
  userId: 'UUID of the user account in the caller permitted scope.',
  patientId: 'UUID of the patient profile in the caller permitted scope.',
  doctorId: 'UUID of the doctor profile in the caller permitted scope.',
  appointmentId: 'UUID of the role-scoped appointment.',
  medicationId: 'UUID of the current patient owned medication.',
  notificationId: 'UUID of the current user owned notification.',
  sessionId: 'UUID of the current user owned authentication session.',
  goalId: 'UUID of the health goal in the caller permitted scope.',
  eventId: 'UUID of the emergency event in the caller permitted scope.',
  page: 'One-based result page number.',
  pageSize: 'Maximum number of results returned on one page.',
  email: 'Normalized account email address.',
  password:
    'Account password; transmitted only over TLS and never returned or logged.',
  token: 'Single-use opaque token; transmitted only over TLS and never logged.',
  role: 'Current account role used for server-side authorization.',
  accountStatus: 'Current account status used for server-side authorization.',
  timeZone: 'IANA time-zone identifier used for local schedules.',
  appointmentDate: 'Future ISO 8601 timestamp with an explicit UTC offset.',
  measuredAt: 'ISO 8601 timestamp at which the observation was measured.',
  scheduledFor: 'ISO 8601 timestamp for the intended dose.',
  startDate: 'ISO 8601 date or timestamp at which the period begins.',
  endDate: 'ISO 8601 date or timestamp at which the period ends.',
  createdAt: 'ISO 8601 timestamp at which the record was created.',
  updatedAt: 'ISO 8601 timestamp at which the record was last updated.',
};

const OPENAPI_PROPERTY_EXAMPLES: Record<
  string,
  string | number | boolean | undefined
> = {
  email: 'patient@example.test',
  timeZone: 'Asia/Beirut',
  page: 1,
  pageSize: 20,
  appointmentDate: '2026-09-01T09:30:00+03:00',
  measuredAt: '2026-08-14T09:30:00Z',
  startDate: '2026-08-14',
};

function openApiPropertyDescription(
  propertyName: string,
  pathParameter: boolean,
): string {
  const explicit = OPENAPI_PROPERTY_DESCRIPTIONS[propertyName];
  if (explicit) return explicit;
  const humanized = humanizeIdentifier(propertyName);
  return pathParameter
    ? `${humanized} used to identify or filter the caller permitted resource.`
    : `${humanized} for this request or response.`;
}

function humanizeIdentifier(value: string): string {
  const humanized = value
    .replace(/[{}]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return humanized
    ? `${humanized.charAt(0).toUpperCase()}${humanized.slice(1)}`
    : 'Value';
}
