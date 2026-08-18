const ACCESS_TOKEN_STORAGE_KEY = "caretrack.accessToken";
const LEGACY_ACCESS_TOKEN_STORAGE_KEY = "accessToken";

export const AUTH_UNAUTHORIZED_EVENT =
  "medical-tracking:unauthorized";

export function getAccessToken(): string | null {
  const accessToken = sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);

  if (accessToken) return accessToken;

  const legacyAccessToken = localStorage.getItem(
    LEGACY_ACCESS_TOKEN_STORAGE_KEY,
  );

  if (legacyAccessToken) {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, legacyAccessToken);
    localStorage.removeItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY);
  }

  return legacyAccessToken;
}

export function setAccessToken(accessToken: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY);
}

export function notifyUnauthorized(): void {
  window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
}
