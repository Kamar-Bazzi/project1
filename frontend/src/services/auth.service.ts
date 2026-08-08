import api from "./api";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export type UserRole = "PATIENT" | "DOCTOR" | "ADMIN";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthenticationResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

interface CurrentUserResponse {
  user: AuthenticatedUser;
}

export const authService = {
  async login(
    payload: LoginPayload,
  ): Promise<AuthenticationResponse> {
    const response =
      await api.post<AuthenticationResponse>(
        "/auth/login",
        payload,
      );

    return response.data;
  },

  async register(
    payload: RegisterPayload,
  ): Promise<AuthenticationResponse> {
    const response =
      await api.post<AuthenticationResponse>(
        "/auth/register",
        payload,
      );

    return response.data;
  },

  async me(): Promise<AuthenticatedUser> {
    const response =
      await api.get<CurrentUserResponse>("/auth/me");

    return response.data.user;
  },
};
