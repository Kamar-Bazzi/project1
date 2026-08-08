import { NotFoundException } from '@nestjs/common';
import { EmergencyContact } from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmergencyContactsService } from './emergency-contacts.service';

describe('EmergencyContactsService', () => {
  const patientFindUnique = jest.fn();
  const contactFindMany = jest.fn();
  const contactFindFirst = jest.fn();
  const contactCreate = jest.fn();
  const contactUpdate = jest.fn();
  const contactDeleteMany = jest.fn();
  const auditRecord = jest.fn();
  const transaction = {
    emergencyContact: {
      findFirst: contactFindFirst,
      create: contactCreate,
      update: contactUpdate,
      deleteMany: contactDeleteMany,
    },
  };
  const runTransaction = jest.fn(
    (callback: (client: typeof transaction) => unknown) =>
      Promise.resolve(callback(transaction)),
  );
  const prisma = {
    patient: { findUnique: patientFindUnique },
    emergencyContact: {
      findMany: contactFindMany,
      findFirst: contactFindFirst,
    },
    $transaction: runTransaction,
  };
  const service = new EmergencyContactsService(
    prisma as unknown as PrismaService,
    { record: auditRecord } as unknown as HealthAuditService,
  );
  const now = new Date('2026-08-08T12:00:00.000Z');
  const contact: EmergencyContact = {
    id: 'contact-1',
    patientId: 'patient-1',
    name: 'Alex Doe',
    relationship: 'Sibling',
    phone: '+961 1 555 555',
    email: 'alex@example.com',
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    patientFindUnique.mockResolvedValue({ id: 'patient-1' });
    auditRecord.mockResolvedValue(undefined);
  });

  it('lists contacts only for the authenticated patient', async () => {
    contactFindMany.mockResolvedValue([contact]);

    await expect(service.findAllForPatient('user-1')).resolves.toEqual([
      contact,
    ]);
    expect(contactFindMany).toHaveBeenCalledWith({
      where: { patientId: 'patient-1' },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });
  });

  it('does not reveal Patient B contact to Patient A', async () => {
    contactFindFirst.mockResolvedValue(null);

    await expect(
      service.findOneForPatient('patient-a-user', 'patient-b-contact'),
    ).rejects.toEqual(new NotFoundException('Emergency contact not found'));
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it('creates a contact under the JWT-derived patient', async () => {
    contactCreate.mockResolvedValue(contact);

    await service.createForPatient('user-1', {
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phone,
      email: contact.email,
      active: true,
    });

    expect(contactCreate).toHaveBeenCalledWith({
      data: {
        patientId: 'patient-1',
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
        email: contact.email,
        active: true,
      },
    });
  });

  it('updates active status only after a scoped ownership read', async () => {
    contactFindFirst.mockResolvedValue(contact);
    contactUpdate.mockResolvedValue({ ...contact, active: false });

    await service.updateForPatient('user-1', contact.id, { active: false });

    expect(contactUpdate).toHaveBeenCalledWith({
      where: { id: contact.id, patientId: 'patient-1' },
      data: { active: false },
    });
  });

  it('cannot remove another patient contact', async () => {
    contactDeleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.deleteForPatient('patient-a-user', 'patient-b-contact'),
    ).rejects.toEqual(new NotFoundException('Emergency contact not found'));
    expect(contactDeleteMany).toHaveBeenCalledWith({
      where: { id: 'patient-b-contact', patientId: 'patient-1' },
    });
  });
});
