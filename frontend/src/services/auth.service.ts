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

export interface AuthenticationResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: "PATIENT" | "DOCTOR" | "ADMIN";
  };
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
};