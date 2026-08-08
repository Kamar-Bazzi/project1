import type { UserRole } from "./auth.service";

const roleHomePaths: Record<UserRole, string> = {
  PATIENT: "/dashboard",
  DOCTOR: "/doctor",
  ADMIN: "/admin",
};

export function getRoleHomePath(role: UserRole): string {
  return roleHomePaths[role];
}
