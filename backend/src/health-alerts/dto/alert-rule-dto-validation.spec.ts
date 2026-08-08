import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { HealthMetricType } from '@prisma/client';
import { validate } from 'class-validator';

import { CreateAlertRuleDto } from './create-alert-rule.dto';
import { HealthAlertQueryDto } from './health-alert-query.dto';
import { UpdateAlertRuleDto } from './update-alert-rule.dto';

describe('alert rule DTO validation', () => {
  it('rejects a create request without either threshold', async () => {
    const dto = plainToInstance(CreateAlertRuleDto, {
      metricType: HealthMetricType.HEART_RATE,
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('rejects reversed create thresholds', async () => {
    const dto = plainToInstance(CreateAlertRuleDto, {
      metricType: HealthMetricType.HEART_RATE,
      minimumValue: 120,
      maximumValue: 80,
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('rejects one-reading alert rules', async () => {
    const dto = plainToInstance(CreateAlertRuleDto, {
      metricType: HealthMetricType.HEART_RATE,
      maximumValue: 120,
      consecutiveReadingsRequired: 1,
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('allows a patch to explicitly clear one threshold', async () => {
    const dto = plainToInstance(UpdateAlertRuleDto, {
      minimumValue: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects null for optional rule fields backed by non-null columns', async () => {
    const dto = plainToInstance(UpdateAlertRuleDto, {
      enabled: null,
      consecutiveReadingsRequired: null,
      severity: null,
      notifyEmergencyContacts: null,
    });

    expect((await validate(dto)).map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'enabled',
        'consecutiveReadingsRequired',
        'severity',
        'notifyEmergencyContacts',
      ]),
    );
  });

  it('rejects null alert query filters instead of forwarding them to Prisma', async () => {
    const dto = plainToInstance(HealthAlertQueryDto, {
      status: null,
      metricType: null,
      limit: null,
    });

    expect((await validate(dto)).map(({ property }) => property)).toEqual(
      expect.arrayContaining(['status', 'metricType', 'limit']),
    );
  });
});
