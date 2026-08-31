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

// force-dynamic 페이지(SSR)에서 데모 데이터로 즉시 폴백해야 하는 호출(예:
// rooms.ts의 getRoom)은 이 값보다 훨씬 짧은 timeoutMs를 명시적으로 넘겨서
// Vercel 서버리스 함수 예산을 지킨다. 로그인처럼 브라우저에서 직접 실행되고
// 실패 시 폴백이 없는 사용자 액션은 이 기본값(Render 무료 인스턴스의 콜드
// 스타트를 버틸 수 있는 넉넉한 시간)을 그대로 쓴다.
const DEFAULT_API_TIMEOUT_MS = 25000;

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean; // attach bearer token (default: true when logged in)
  timeoutMs?: number; // 기본 25초 — SSR 호출처럼 빨리 실패해야 하면 짧게 지정
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
        const res = await fetchWithTimeout(
          `${API_BASE_URL}/auth/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          },
          DEFAULT_API_TIMEOUT_MS,
        );
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
  const {
    body,
    auth = true,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    _retried,
    headers,
    ...rest
  } = opts;

  const finalHeaders: Record<string, string> = {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...((headers as Record<string, string>) ?? {}),
  };

  const token = authStore.getAccessToken();
  if (auth && token) finalHeaders["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      {
        ...rest,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      timeoutMs,
    );
  } catch (err) {
    // AbortController가 타임아웃으로 끊으면 브라우저는 "signal is aborted
    // without reason" 같은 원문 메시지를 그대로 던진다 — 로그인 폼 등에서
    // e.message를 그대로 보여주면 사용자에게는 의미 없는 문구가 된다.
    // Render 무료 인스턴스가 잠들어 있다 깨어나는 콜드 스타트일 가능성이
    // 커서, 재시도를 유도하는 문구로 바꿔서 던진다.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(
        0,
        "서버 연결이 지연되고 있어요. 잠시 후 다시 시도해주세요.",
      );
    }
    throw err;
  }

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
