// ── API client ──────────────────────────────────────────────────────
// Thin fetch wrapper around the NestJS API. Responsibilities:
//   • prefix requests with API_BASE_URL
//   • attach the JWT access token as a Bearer header
//   • on 401, transparently refresh the token pair once and retry
//   • surface a typed ApiError so callers can branch on status
//
// The refresh is single-flight: concurrent 401s share one refresh call so we
// never rotate the refresh token more than once per expiry.

import { API_BASE_URL } from "./config";
import { authStore } from "./auth-store";
import { fetchWithTimeout } from "./fetch-timeout";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean; // attach bearer token (default: true when logged in)
  _retried?: boolean; // internal: prevents infinite refresh loops
}

// ── single-flight refresh ──
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = authStore.getRefreshToken();
  if (!refreshToken) return false;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          authStore.clear(); // refresh rejected → force re-login
          return false;
        }
        const data = await res.json();
        authStore.updateTokens(data.accessToken, data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const { body, auth = true, _retried, headers, ...rest } = opts;

  const finalHeaders: Record<string, string> = {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...((headers as Record<string, string>) ?? {}),
  };

  const token = authStore.getAccessToken();
  if (auth && token) finalHeaders["Authorization"] = `Bearer ${token}`;

  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // ── refresh-on-401 (once) ──
  if (res.status === 401 && auth && !_retried && authStore.getRefreshToken()) {
    const ok = await refreshTokens();
    if (ok) return apiFetch<T>(path, { ...opts, _retried: true });
  }

  if (!res.ok) {
    let parsed: unknown;
    let message = `요청에 실패했습니다 (${res.status})`;
    try {
      parsed = await res.json();
      const m = (parsed as { message?: string | string[] })?.message;
      if (Array.isArray(m)) message = m.join(", ");
      else if (typeof m === "string") message = m;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, parsed);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) =>
    apiFetch<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiFetch<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiFetch<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiFetch<T>(path, { ...opts, method: "PUT", body }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    apiFetch<T>(path, { ...opts, method: "DELETE" }),
};
