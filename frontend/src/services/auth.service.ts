import api from "./api";
import { clearAccessToken, setAccessToken } from "./auth-storage";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  timeZone?: string;
}

export type UserRole = "PATIENT" | "DOCTOR" | "ADMIN";
export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  accountStatus?: AccountStatus;
  emailVerified?: boolean;
  createdAt: string;
}

export interface AuthenticationResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface RegistrationResponse {
  accessToken?: string;
  requiresEmailVerification?: boolean;
  user: AuthenticatedUser;
}

interface CurrentUserResponse {
  user: AuthenticatedUser;
}

export interface AuthSession {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  createdByIp: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface SecurityEvent {
  id: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: {
    suspicious?: boolean;
    reason?: string;
    [key: string]: unknown;
  } | null;
  createdAt: string;
}

interface SessionListResponse {
  items: AuthSession[];
}

interface MessageResponse {
  message: string;
}

interface SecurityEventListResponse {
  items: SecurityEvent[];
}

export const authService = {
  async login(payload: LoginPayload): Promise<AuthenticationResponse> {
    const response = await api.post<AuthenticationResponse>(
      "/auth/login",
      payload,
    );

    return response.data;
  },

  async register(payload: RegisterPayload): Promise<RegistrationResponse> {
    const response = await api.post<RegistrationResponse>(
      "/auth/register",
      payload,
    );

    return response.data;
  },

  async me(): Promise<AuthenticatedUser> {
    const response = await api.get<CurrentUserResponse>("/auth/me");

    return response.data.user;
  },

  async refresh(): Promise<AuthenticationResponse> {
    const response = await api.post<AuthenticationResponse>("/auth/refresh");
    setAccessToken(response.data.accessToken);
    return response.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } finally {
      clearAccessToken();
    }
  },

  async forgotPassword(email: string): Promise<string> {
    const response = await api.post<MessageResponse>("/auth/forgot-password", {
      email,
    });
    return response.data.message;
  },

  async resetPassword(token: string, password: string): Promise<string> {
    const response = await api.post<MessageResponse>("/auth/reset-password", {
      token,
      password,
    });
    return response.data.message;
  },

  async confirmEmail(token: string): Promise<string> {
    const response = await api.post<MessageResponse>(
      "/auth/email-verification/confirm",
      { token },
    );
    return response.data.message;
  },

  async requestEmailVerification(): Promise<string> {
    const response = await api.post<MessageResponse>(
      "/auth/email-verification/request",
    );
    return response.data.message;
  },

  async listSessions(): Promise<AuthSession[]> {
    const response = await api.get<SessionListResponse>("/auth/sessions");
    return response.data.items;
  },

  async revokeSession(sessionId: string): Promise<void> {
    await api.delete(`/auth/sessions/${sessionId}`);
  },

  async revokeOtherSessions(): Promise<void> {
    await api.delete("/auth/sessions");
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<string> {
    const response = await api.patch<MessageResponse>("/auth/password", {
      currentPassword,
      newPassword,
    });
    return response.data.message;
  },

  async listSecurityEvents(limit = 25): Promise<SecurityEvent[]> {
    const response = await api.get<SecurityEventListResponse>(
      "/auth/security-events",
      { params: { limit } },
    );
    return response.data.items;
  },
};
