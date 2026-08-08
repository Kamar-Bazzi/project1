import { PrismaService } from '../../prisma/prisma.service';
import { HealthAuditEvent, HealthAuditService } from './health-audit.service';

describe('HealthAuditService', () => {
  const create = jest.fn();
  const prisma = { auditLog: { create } };
  const service = new HealthAuditService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({ id: 'audit-1' });
  });

  it('keeps identifiers and summaries while dropping health and contact data', async () => {
    const event = {
      userId: 'user-1',
      action: 'HEALTH_DATA_ACCESSED',
      entity: 'HealthMetric',
      entityId: 'metric-1',
      metadata: {
        patientId: 'patient-1',
        metricType: 'HEART_RATE',
        count: 2,
        value: 188,
        phone: '+1 555 0100',
        email: 'private@example.com',
        name: 'Private Person',
      },
    } as unknown as HealthAuditEvent;

    await service.record(event);

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'HEALTH_DATA_ACCESSED',
        entity: 'HealthMetric',
        entityId: 'metric-1',
        metadata: {
          patientId: 'patient-1',
          metricType: 'HEART_RATE',
          count: 2,
        },
      },
    });
  });
});
