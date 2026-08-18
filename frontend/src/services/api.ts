import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  clearAccessToken,
  getAccessToken,
  notifyUnauthorized,
  setAccessToken,
} from "./auth-storage";
import { getBrowserTimeZone } from "./browser-time-zone";

const publicAuthEndpoints = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/email-verification/confirm",
] as const;

function isPublicAuthRequest(url?: string): boolean {
  const requestUrl = url?.split("?", 1)[0].replace(/\/+$/, "");

  return publicAuthEndpoints.some(
    (endpoint) =>
      requestUrl === endpoint || requestUrl?.endsWith(endpoint),
  );
}

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
  withCredentials: true,
});

const browserTimeZone = getBrowserTimeZone();

api.interceptors.request.use((config) => {
  const accessToken = getAccessToken();

  if (accessToken && !isPublicAuthRequest(config.url)) {
    config.headers.Authorization =
      `Bearer ${accessToken}`;
  }

  if (browserTimeZone) {
    config.headers["X-Time-Zone"] = browserTimeZone;
  }

  return config;
});

interface RefreshResponse {
  accessToken: string;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _careTrackRetried?: boolean;
}

let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<RefreshResponse>(
        `${API_BASE_URL}/auth/refresh`,
        {},
        {
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
          withCredentials: true,
        },
      )
      .then((response) => {
        setAccessToken(response.data.accessToken);
        return response.data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetryableRequestConfig | undefined;

    if (
      error.response?.status === 401 &&
      request &&
      !request._careTrackRetried &&
      !isPublicAuthRequest(request.url)
    ) {
      request._careTrackRetried = true;

      try {
        const accessToken = await refreshAccessToken();
        request.headers.Authorization = `Bearer ${accessToken}`;
        return await api(request);
      } catch {
        clearAccessToken();
        notifyUnauthorized();
      }
    } else if (
      error.response?.status === 401 &&
      !isPublicAuthRequest(request?.url)
    ) {
      clearAccessToken();
      notifyUnauthorized();
    }

    return Promise.reject(error);
  },
);

export default api;
