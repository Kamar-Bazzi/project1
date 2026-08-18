import type {
  AdminDashboard,
  AdminDoctor,
  AdminUser,
  AdminUserFilters,
  AuditLog,
  CreateAdminUserInput,
  DoctorPatientAssignment,
  PaginatedResponse,
  UpdateAdminUserInput,
} from "../types/admin";
import api from "./api";

export const adminService = {
  async dashboard(): Promise<AdminDashboard> {
    const response = await api.get<AdminDashboard>("/admin/dashboard");
    return response.data;
  },

  async listUsers(
    filters: AdminUserFilters = {},
  ): Promise<PaginatedResponse<AdminUser>> {
    const response = await api.get<PaginatedResponse<AdminUser>>(
      "/admin/users",
      { params: filters },
    );
    return response.data;
  },

  async getUser(userId: string): Promise<AdminUser> {
    const response = await api.get<AdminUser>(`/admin/users/${userId}`);
    return response.data;
  },

  async createUser(input: CreateAdminUserInput): Promise<AdminUser> {
    const response = await api.post<AdminUser>("/admin/users", input);
    return response.data;
  },

  async updateUser(
    userId: string,
    input: UpdateAdminUserInput,
  ): Promise<AdminUser> {
    const response = await api.patch<AdminUser>(
      `/admin/users/${userId}`,
      input,
    );
    return response.data;
  },

  async deactivateUser(userId: string): Promise<void> {
    await api.delete(`/admin/users/${userId}`);
  },

  async listDoctors(
    page = 1,
    pageSize = 100,
    search?: string,
  ): Promise<PaginatedResponse<AdminDoctor>> {
    const response = await api.get<PaginatedResponse<AdminDoctor>>(
      "/admin/doctors",
      { params: { page, pageSize, search: search || undefined } },
    );
    return response.data;
  },

  async listAssignments(
    page = 1,
    pageSize = 100,
    active?: boolean,
  ): Promise<PaginatedResponse<DoctorPatientAssignment>> {
    const response = await api.get<PaginatedResponse<DoctorPatientAssignment>>(
      "/admin/assignments",
      { params: { page, pageSize, active } },
    );
    return response.data;
  },

  async createAssignment(
    doctorId: string,
    patientId: string,
  ): Promise<DoctorPatientAssignment> {
    const response = await api.post<DoctorPatientAssignment>(
      "/admin/assignments",
      { doctorId, patientId },
    );
    return response.data;
  },

  async revokeAssignment(
    doctorId: string,
    patientId: string,
  ): Promise<void> {
    await api.delete(`/admin/assignments/${doctorId}/${patientId}`);
  },

  async listAuditLogs(
    page = 1,
    pageSize = 50,
    action?: string,
  ): Promise<PaginatedResponse<AuditLog>> {
    const response = await api.get<PaginatedResponse<AuditLog>>(
      "/admin/audit-logs",
      { params: { page, pageSize, action: action || undefined } },
    );
    return response.data;
  },
};
