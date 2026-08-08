import axios from "axios";

interface ApiErrorResponse {
  message?: string | string[];
}

export function isUnauthorizedApiError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response?.status === 401
  );
}

export function getApiErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (!axios.isAxiosError<ApiErrorResponse>(error)) {
    return fallbackMessage;
  }

  if (!error.response) {
    if (error.code === "ECONNABORTED") {
      return "The request timed out. Please try again.";
    }

    return "Unable to reach the server. Check your connection and try again.";
  }

  const responseMessage = error.response.data?.message;

  if (Array.isArray(responseMessage)) {
    return responseMessage.join(" ");
  }

  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage;
  }

  return fallbackMessage;
}
