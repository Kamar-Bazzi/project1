import axios from "axios";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ??
    "http://localhost:3000",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const accessToken =
    localStorage.getItem("accessToken");

  if (accessToken) {
    config.headers.Authorization =
      `Bearer ${accessToken}`;
  }

  return config;
});

export default api;