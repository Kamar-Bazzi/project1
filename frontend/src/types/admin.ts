import type {
  AccountStatus,
  UserRole,
} from "../services/auth.service";

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: Pagination;
}

export interface AdminPatientProfile {
  id: string;
  timeZone?: string | null;
}

export interface AdminDoctorProfile {
  id: string;
  specialization: string | null;
  licenseNumber: string | null;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  emailVerifiedAt?: string | null;
  patient: AdminPatientProfile | null;
  doctor: AdminDoctorProfile | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: UserRole;
  accountStatus?: AccountStatus;
}

export interface CreateAdminUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  accountStatus?: AccountStatus;
  specialization?: string | null;
  licenseNumber?: string | null;
  timeZone?: string;
}

export interface UpdateAdminUserInput {
  name?: string;
  role?: UserRole;
  accountStatus?: AccountStatus;
  specialization?: string | null;
  licenseNumber?: string | null;
}

export interface AdminDoctor {
  id: string;
  userId: string;
  specialization: string | null;
  licenseNumber: string | null;
  assignedPatientCount: number;
  user: {
    name: string;
    email: string;
    accountStatus: AccountStatus;
  };
}

export interface DoctorPatientAssignment {
  id: string;
  doctorId: string;
  patientId: string;
  active: boolean;
  grantedAt: string;
  revokedAt: string | null;
  doctor: AdminDoctorProfile & {
    user: { name: string; email: string };
  };
  patient: AdminPatientProfile & {
    user: { name: string; email: string };
  };
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  user: { id: string; name: string; email: string } | null;
  createdAt: string;
}

export interface AdminDashboard {
  summary: {
    users: number;
    patients: number;
    doctors: number;
    administrators: number;
    activeUsers: number;
    suspendedUsers: number;
    disabledUsers: number;
    activeAssignments: number;
    upcomingAppointments: number;
    auditEventsLast24Hours: number;
    securityEventsLast24Hours: number;
  };
  recentUsers: AdminUser[];
  recentAuditLogs: AuditLog[];
  recentSecurityActivity: AuditLog[];
}
