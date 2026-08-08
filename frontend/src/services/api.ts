import axios from "axios";
import {
  clearAccessToken,
  getAccessToken,
  notifyUnauthorized,
} from "./auth-storage";

const publicAuthEndpoints = [
  "/auth/login",
  "/auth/register",
] as const;

function isPublicAuthRequest(url?: string): boolean {
  const requestUrl = url?.split("?", 1)[0].replace(/\/+$/, "");

  return publicAuthEndpoints.some(
    (endpoint) =>
      requestUrl === endpoint || requestUrl?.endsWith(endpoint),
  );
}

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ??
    "http://localhost:3000/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const accessToken = getAccessToken();

  if (accessToken && !isPublicAuthRequest(config.url)) {
    config.headers.Authorization =
      `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !isPublicAuthRequest(error.config?.url)
    ) {
      clearAccessToken();
      notifyUnauthorized();
    }

    return Promise.reject(error);
  },
);

export default api;
