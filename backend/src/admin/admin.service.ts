import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  AppointmentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { paginationMetadata } from '../common/dto/pagination-query.dto';
import {
  canonicalizeIanaTimeZone,
  DEFAULT_TIME_ZONE,
} from '../common/validators/is-iana-time-zone.validator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminDoctorQueryDto } from './dto/admin-doctor-query.dto';
import {
  AdminUserQueryDto,
  CreateAdminUserDto,
  UpdateAdminUserDto,
} from './dto/admin-user.dto';
import { AssignmentQueryDto, CreateAssignmentDto } from './dto/assignment.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  accountStatus: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      dateOfBirth: true,
      phoneNumber: true,
      timeZone: true,
    },
  },
  doctor: {
    select: {
      id: true,
      specialization: true,
      licenseNumber: true,
      _count: {
        select: {
          patientAccessGrants: { where: { active: true } },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

const assignmentInclude = {
  doctor: {
    select: {
      id: true,
      specialization: true,
      licenseNumber: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          accountStatus: true,
          emailVerifiedAt: true,
        },
      },
    },
  },
  patient: {
    select: {
      id: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          accountStatus: true,
          emailVerifiedAt: true,
        },
      },
    },
  },
} satisfies Prisma.DoctorPatientAccessInclude;

const SECURITY_AUDIT_ACTIONS = [
  'LOGIN_FAILED',
  'REFRESH_TOKEN_REUSE',
  'PASSWORD_CHANGE_FAILED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'SESSION_REVOKED',
  'SESSIONS_REVOKED',
  'ADMIN_USER_DISABLED',
  'ADMIN_USER_UPDATED',
  'DOCTOR_PATIENT_ACCESS_GRANTED',
  'DOCTOR_PATIENT_ACCESS_REVOKED',
];

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const now = new Date();
    const [
      users,
      activeUsers,
      suspendedUsers,
      disabledUsers,
      patients,
      doctors,
      administrators,
      activeAssignments,
      upcomingAppointments,
      auditEventsLast24Hours,
      securityEventsLast24Hours,
      recentUsers,
      recentAuditLogs,
      recentSecurityActivity,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { accountStatus: AccountStatus.ACTIVE },
      }),
      this.prisma.user.count({
        where: { accountStatus: AccountStatus.SUSPENDED },
      }),
      this.prisma.user.count({
        where: { accountStatus: AccountStatus.DISABLED },
      }),
      this.prisma.user.count({ where: { role: UserRole.PATIENT } }),
      this.prisma.user.count({ where: { role: UserRole.DOCTOR } }),
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
      this.prisma.doctorPatientAccess.count({ where: { active: true } }),
      this.prisma.appointment.count({
        where: {
          status: AppointmentStatus.SCHEDULED,
          appointmentDate: { gte: now },
        },
      }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.auditLog.count({
        where: {
          action: { in: SECURITY_AUDIT_ACTIONS },
          createdAt: { gte: since },
        },
      }),
      this.prisma.user.findMany({
        select: adminUserSelect,
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.auditLog.findMany({
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.auditLog.findMany({
        where: { action: { in: SECURITY_AUDIT_ACTIONS } },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      summary: {
        users,
        activeUsers,
        suspendedUsers,
        disabledUsers,
        patients,
        doctors,
        administrators,
        activeAssignments,
        upcomingAppointments,
        auditEventsLast24Hours,
        securityEventsLast24Hours,
      },
      recentUsers,
      recentAuditLogs,
      recentSecurityActivity,
    };
  }

  async findUsers(query: AdminUserQueryDto) {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      accountStatus: query.accountStatus,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: adminUserSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      pagination: paginationMetadata(query.page, query.pageSize, total),
    };
  }

  async findUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: adminUserSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async createUser(actorUserId: string, dto: CreateAdminUserDto) {
    this.assertDoctorFields(dto.role, dto);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            passwordHash,
            role: dto.role,
            accountStatus: dto.accountStatus ?? AccountStatus.ACTIVE,
            patient:
              dto.role === UserRole.PATIENT
                ? {
                    create: {
                      timeZone:
                        canonicalizeIanaTimeZone(dto.timeZone) ??
                        DEFAULT_TIME_ZONE,
                    },
                  }
                : undefined,
            doctor:
              dto.role === UserRole.DOCTOR
                ? {
                    create: {
                      specialization: dto.specialization ?? null,
                      licenseNumber: dto.licenseNumber ?? null,
                    },
                  }
                : undefined,
          },
          select: adminUserSelect,
        });

        await this.recordAudit(transaction, {
          userId: actorUserId,
          action: 'ADMIN_USER_CREATED',
          entity: 'User',
          entityId: user.id,
          metadata: {
            role: user.role,
            accountStatus: user.accountStatus,
          },
        });

        return user;
      });
    } catch (error) {
      this.rethrowUniqueConflict(error);
    }
  }

  async updateUser(
    actorUserId: string,
    targetUserId: string,
    dto: UpdateAdminUserDto,
  ) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one user field is required');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.user.findUnique({
          where: { id: targetUserId },
          select: {
            id: true,
            role: true,
            accountStatus: true,
            patient: { select: { id: true } },
            doctor: { select: { id: true } },
          },
        });

        if (!existing) {
          throw new NotFoundException('User not found');
        }

        if (
          actorUserId === targetUserId &&
          ((dto.role !== undefined && dto.role !== UserRole.ADMIN) ||
            (dto.accountStatus !== undefined &&
              dto.accountStatus !== AccountStatus.ACTIVE))
        ) {
          throw new ForbiddenException(
            'Administrators cannot remove their own active admin access',
          );
        }

        const resultingRole = dto.role ?? existing.role;
        const resultingStatus = dto.accountStatus ?? existing.accountStatus;
        this.assertDoctorFields(resultingRole, dto);

        if (
          existing.role === UserRole.ADMIN &&
          existing.accountStatus === AccountStatus.ACTIVE &&
          (resultingRole !== UserRole.ADMIN ||
            resultingStatus !== AccountStatus.ACTIVE)
        ) {
          await this.assertAnotherActiveAdmin(transaction, targetUserId);
        }

        if (resultingRole === UserRole.PATIENT && !existing.patient) {
          await transaction.patient.create({
            data: { userId: targetUserId, timeZone: DEFAULT_TIME_ZONE },
          });
        }

        if (resultingRole === UserRole.DOCTOR) {
          if (existing.doctor) {
            if (
              dto.specialization !== undefined ||
              dto.licenseNumber !== undefined
            ) {
              await transaction.doctor.update({
                where: { id: existing.doctor.id },
                data: {
                  specialization: dto.specialization,
                  licenseNumber: dto.licenseNumber,
                },
              });
            }
          } else {
            await transaction.doctor.create({
              data: {
                userId: targetUserId,
                specialization: dto.specialization ?? null,
                licenseNumber: dto.licenseNumber ?? null,
              },
            });
          }
        }

        const user = await transaction.user.update({
          where: { id: targetUserId },
          data: {
            name: dto.name,
            role: dto.role,
            accountStatus: dto.accountStatus,
          },
          select: adminUserSelect,
        });

        if (
          existing.doctor &&
          (resultingRole !== UserRole.DOCTOR ||
            resultingStatus !== AccountStatus.ACTIVE)
        ) {
          await transaction.doctorPatientAccess.updateMany({
            where: { doctorId: existing.doctor.id, active: true },
            data: { active: false, revokedAt: new Date() },
          });
        }

        if (
          existing.patient &&
          (resultingRole !== UserRole.PATIENT ||
            resultingStatus !== AccountStatus.ACTIVE)
        ) {
          await transaction.doctorPatientAccess.updateMany({
            where: { patientId: existing.patient.id, active: true },
            data: { active: false, revokedAt: new Date() },
          });
        }

        if (
          resultingRole !== existing.role ||
          resultingStatus !== existing.accountStatus
        ) {
          await transaction.authSession.updateMany({
            where: { userId: targetUserId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }

        await this.recordAudit(transaction, {
          userId: actorUserId,
          action: 'ADMIN_USER_UPDATED',
          entity: 'User',
          entityId: user.id,
          metadata: {
            previousRole: existing.role,
            role: user.role,
            previousAccountStatus: existing.accountStatus,
            accountStatus: user.accountStatus,
          },
        });

        return user;
      });
    } catch (error) {
      this.rethrowUniqueConflict(error);
    }
  }

  async disableUser(actorUserId: string, targetUserId: string): Promise<void> {
    if (actorUserId === targetUserId) {
      throw new ForbiddenException(
        'Administrators cannot disable their own account',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          role: true,
          accountStatus: true,
          patient: { select: { id: true } },
          doctor: { select: { id: true } },
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (
        user.role === UserRole.ADMIN &&
        user.accountStatus === AccountStatus.ACTIVE
      ) {
        await this.assertAnotherActiveAdmin(transaction, targetUserId);
      }

      if (user.accountStatus !== AccountStatus.DISABLED) {
        await transaction.user.update({
          where: { id: user.id },
          data: { accountStatus: AccountStatus.DISABLED },
        });
      }

      await transaction.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (user.doctor) {
        await transaction.doctorPatientAccess.updateMany({
          where: { doctorId: user.doctor.id, active: true },
          data: { active: false, revokedAt: new Date() },
        });
      }

      if (user.patient) {
        await transaction.doctorPatientAccess.updateMany({
          where: { patientId: user.patient.id, active: true },
          data: { active: false, revokedAt: new Date() },
        });
      }

      await this.recordAudit(transaction, {
        userId: actorUserId,
        action: 'ADMIN_USER_DISABLED',
        entity: 'User',
        entityId: user.id,
        metadata: { previousAccountStatus: user.accountStatus },
      });
    });
  }

  async findDoctors(query: AdminDoctorQueryDto) {
    const where: Prisma.DoctorWhereInput = {
      user: {
        role: UserRole.DOCTOR,
        accountStatus: query.accountStatus,
        OR: query.search
          ? [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
    };
    const skip = (query.page - 1) * query.pageSize;
    const [doctors, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({
        where,
        select: {
          id: true,
          userId: true,
          specialization: true,
          licenseNumber: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              accountStatus: true,
              emailVerifiedAt: true,
            },
          },
          _count: {
            select: {
              patientAccessGrants: { where: { active: true } },
            },
          },
        },
        orderBy: { user: { name: 'asc' } },
        skip,
        take: query.pageSize,
      }),
      this.prisma.doctor.count({ where }),
    ]);
    const items = doctors.map(({ _count, ...doctor }) => ({
      ...doctor,
      assignedPatientCount: _count.patientAccessGrants,
    }));

    return {
      items,
      pagination: paginationMetadata(query.page, query.pageSize, total),
    };
  }

  async findAssignments(query: AssignmentQueryDto) {
    const where: Prisma.DoctorPatientAccessWhereInput = {
      doctorId: query.doctorId,
      patientId: query.patientId,
      active: query.active,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.doctorPatientAccess.findMany({
        where,
        include: assignmentInclude,
        orderBy: [{ active: 'desc' }, { grantedAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.doctorPatientAccess.count({ where }),
    ]);

    return {
      items,
      pagination: paginationMetadata(query.page, query.pageSize, total),
    };
  }

  async createAssignment(actorUserId: string, dto: CreateAssignmentDto) {
    return this.prisma.$transaction(async (transaction) => {
      const [doctor, patient] = await Promise.all([
        transaction.doctor.findFirst({
          where: {
            id: dto.doctorId,
            user: {
              role: UserRole.DOCTOR,
              accountStatus: AccountStatus.ACTIVE,
            },
          },
          select: { id: true },
        }),
        transaction.patient.findFirst({
          where: {
            id: dto.patientId,
            user: {
              role: UserRole.PATIENT,
              accountStatus: AccountStatus.ACTIVE,
            },
          },
          select: { id: true },
        }),
      ]);

      if (!doctor) {
        throw new NotFoundException('Active doctor not found');
      }
      if (!patient) {
        throw new NotFoundException('Active patient not found');
      }

      const now = new Date();
      const assignment = await transaction.doctorPatientAccess.upsert({
        where: {
          doctorId_patientId: {
            doctorId: doctor.id,
            patientId: patient.id,
          },
        },
        update: {
          active: true,
          grantedAt: now,
          revokedAt: null,
        },
        create: {
          doctorId: doctor.id,
          patientId: patient.id,
          active: true,
          grantedAt: now,
        },
        include: assignmentInclude,
      });

      await this.recordAudit(transaction, {
        userId: actorUserId,
        action: 'DOCTOR_PATIENT_ACCESS_GRANTED',
        entity: 'DoctorPatientAccess',
        entityId: assignment.id,
        metadata: {
          doctorId: assignment.doctorId,
          patientId: assignment.patientId,
        },
      });

      return assignment;
    });
  }

  revokeAssignment(actorUserId: string, doctorId: string, patientId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.doctorPatientAccess.findFirst({
        where: { doctorId, patientId, active: true },
      });

      if (!existing) {
        throw new NotFoundException('Active assignment not found');
      }

      const assignment = await transaction.doctorPatientAccess.update({
        where: { id: existing.id },
        data: { active: false, revokedAt: new Date() },
        include: assignmentInclude,
      });

      await this.recordAudit(transaction, {
        userId: actorUserId,
        action: 'DOCTOR_PATIENT_ACCESS_REVOKED',
        entity: 'DoctorPatientAccess',
        entityId: assignment.id,
        metadata: { doctorId, patientId },
      });

      return assignment;
    });
  }

  async findAuditLogs(query: AuditLogQueryDto) {
    if (
      query.from &&
      query.to &&
      new Date(query.from).getTime() > new Date(query.to).getTime()
    ) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const where: Prisma.AuditLogWhereInput = {
      userId: query.userId,
      action: query.action
        ? { contains: query.action, mode: 'insensitive' }
        : undefined,
      entity: query.entity
        ? { contains: query.entity, mode: 'insensitive' }
        : undefined,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      pagination: paginationMetadata(query.page, query.pageSize, total),
    };
  }

  getRoleOptions() {
    return {
      roles: Object.values(UserRole),
      accountStatuses: Object.values(AccountStatus),
    };
  }

  private assertDoctorFields(
    role: UserRole,
    dto: { specialization?: string | null; licenseNumber?: string | null },
  ): void {
    if (
      role !== UserRole.DOCTOR &&
      (dto.specialization !== undefined || dto.licenseNumber !== undefined)
    ) {
      throw new BadRequestException(
        'specialization and licenseNumber are only valid for doctors',
      );
    }
  }

  private async assertAnotherActiveAdmin(
    transaction: Prisma.TransactionClient,
    excludedUserId: string,
  ): Promise<void> {
    const activeAdministratorCount = await transaction.user.count({
      where: {
        id: { not: excludedUserId },
        role: UserRole.ADMIN,
        accountStatus: AccountStatus.ACTIVE,
      },
    });

    if (activeAdministratorCount === 0) {
      throw new ConflictException(
        'At least one active administrator is required',
      );
    }
  }

  private rethrowUniqueConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'A user with this email or doctor license already exists',
      );
    }

    throw error;
  }

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    event: {
      userId: string;
      action: string;
      entity: string;
      entityId: string;
      metadata?: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await transaction.auditLog.create({ data: event });
  }
}
