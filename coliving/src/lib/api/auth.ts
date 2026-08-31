// ── Auth service ────────────────────────────────────────────────────
// Wraps the NestJS /auth endpoints and keeps the token store in sync.
// OAuth (Google/Kakao/Naver/Apple) is a browser redirect to the API, which
// returns { accessToken, refreshToken, user } — see completeOAuth().

import { API_BASE_URL, USE_REAL_API } from "./config";
import { api } from "./client";
import { fetchWithTimeout } from "./fetch-timeout";
import {
  authStore,
  type AuthTokens,
  type AuthUser,
  type Gender,
  type GenderVisibility,
  type RoommateGenderPreference,
} from "./auth-store";

// In demo mode (no backend) we fabricate a local session so the login UI is
// fully clickable on the portfolio deployment. Tokens are dummy strings — the
// app never calls a real API in this mode.
function demoTokens(
  email: string,
  name?: string,
  preferredLocale: "KO" | "EN" = "KO",
  gender: Gender = "OTHER",
): AuthTokens {
  return {
    accessToken: "demo-access",
    refreshToken: "demo-refresh",
    user: {
      id: "demo-user",
      email,
      role: "USER",
      name: name ?? `사용자${Math.random().toString(36).slice(2, 8)}`,
      nicknameCompleted: Boolean(name?.trim()),
      gender,
      genderVisibility: "MATCHED_ONLY",
      roommateGenderPreference: "ANY",
      preferredLocale,
    },
  };
}

// Register can resolve two ways now:
//   • { user }            — logged in immediately (demo mode, or no mail provider)
//   • { verificationRequired } — a verification email was sent; NOT logged in
export type RegisterResult =
  | { user: AuthUser }
  | { verificationRequired: true; email: string; message: string };

export async function register(
  email: string,
  password: string,
  name: string,
  gender: Exclude<Gender, "OTHER">,
  preferredLocale: "KO" | "EN",
): Promise<RegisterResult> {
  if (!USE_REAL_API) {
    const t = demoTokens(email, name, preferredLocale, gender);
    authStore.set(t);
    return { user: t.user };
  }
  const res = await api.post<
    AuthTokens | { verificationRequired: true; email: string; message: string }
  >(
    "/auth/register",
    { email, password, name, gender, preferredLocale },
    { auth: false },
  );

  if ("verificationRequired" in res) {
    // No session yet — the caller shows a "check your email" state.
    return res;
  }
  authStore.set(res);
  return { user: res.user };
}

// POST /auth/verify-email — consume the emailed token, log the user in.
export async function verifyEmail(token: string): Promise<AuthUser> {
  const res = await api.post<AuthTokens>(
    "/auth/verify-email",
    { token },
    { auth: false },
  );
  authStore.set(res);
  return res.user;
}

// POST /auth/resend-verification — always resolves (no account enumeration).
export async function resendVerification(email: string): Promise<void> {
  await api.post("/auth/resend-verification", { email }, { auth: false });
}

export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  if (!USE_REAL_API) {
    const t = demoTokens(email);
    authStore.set(t);
    return t.user;
  }
  const res = await api.post<AuthTokens>(
    "/auth/login",
    { email, password },
    { auth: false },
  );
  authStore.set(res);
  // Login only issues a minimal user (id/email/role/...). Badge and tier
  // fields (completedStays, reviewsWritten, verified, tier) are computed
  // fresh in getMe, so fetch them right away instead of leaving the UI
  // showing a stale/empty activity tier until the next reload.
  const fresh = await fetchMe();
  return fresh ?? res.user;
}

export function logout() {
  authStore.clear();
}

// Re-fetch the current user (validates the access token, refreshing if stale).
export async function fetchMe(): Promise<AuthUser | null> {
  if (!USE_REAL_API || !authStore.isAuthenticated()) return authStore.getUser();
  try {
    const me = await api.get<ApiMe>("/auth/me");
    const user = toAuthUser(me);
    const current = authStore.get();
    if (current) authStore.set({ ...current, user });
    return user;
  } catch {
    return null;
  }
}

interface ApiMe {
  sub?: string;
  id?: string;
  email: string;
  role: string;
  name?: string | null;
  nicknameCompleted?: boolean;
  bio?: string | null;
  avatarColor?: string;
  avatarUrl?: string | null;
  gender?: Gender;
  genderVisibility?: GenderVisibility;
  roommateGenderPreference?: RoommateGenderPreference;
  birthDate?: string | null;
  preferredLocale?: "KO" | "EN";
  hasPassword?: boolean;
  createdAt?: string | null;
  verified?: boolean;
  tier?: "SEED" | "SPROUT" | "REGULAR" | "TRUSTED" | "ELITE";
  tierLabel?: string;
  completedStays?: number;
  reviewsWritten?: number;
}

function toAuthUser(me: ApiMe): AuthUser {
  return {
    id: me.id ?? me.sub ?? "",
    email: me.email,
    role: me.role,
    name: me.name ?? undefined,
    nicknameCompleted: me.nicknameCompleted ?? true,
    bio: me.bio ?? null,
    avatarColor: me.avatarColor,
    avatarUrl: me.avatarUrl ?? null,
    gender: me.gender ?? "OTHER",
    genderVisibility: me.genderVisibility ?? "MATCHED_ONLY",
    verified: me.verified,
    tier: me.tier,
    tierLabel: me.tierLabel,
    completedStays: me.completedStays,
    reviewsWritten: me.reviewsWritten,
    roommateGenderPreference: me.roommateGenderPreference ?? "ANY",
    birthDate: me.birthDate ?? null,
    preferredLocale: me.preferredLocale ?? "KO",
    hasPassword: me.hasPassword,
    createdAt: me.createdAt ?? null,
  };
}

// PATCH /auth/me — update own profile. Email and role are not accepted by the
// API, so they can't be changed here.
export async function updateProfile(data: {
  name?: string;
  bio?: string;
  avatarColor?: string;
  avatarUrl?: string | null;
  gender?: Exclude<Gender, "OTHER">;
  genderVisibility?: GenderVisibility;
  roommateGenderPreference?: RoommateGenderPreference;
  // YYYY-MM-DD 또는 ISO 문자열. null이면 생년월일을 지운다.
  birthDate?: string | null;
}): Promise<AuthUser> {
  const me = await api.patch<ApiMe>("/auth/me", data);
  const user = toAuthUser(me);
  // Keep the store in sync so the header/sidebar update immediately.
  const current = authStore.get();
  if (current) authStore.set({ ...current, user });
  return user;
}

export async function updatePreferredLocale(
  preferredLocale: "KO" | "EN",
): Promise<"KO" | "EN"> {
  const current = authStore.get();

  if (!USE_REAL_API) {
    if (current) {
      authStore.set({
        ...current,
        user: {
          ...current.user,
          preferredLocale,
        },
      });
    }

    return preferredLocale;
  }

  const result = await api.patch<{
    id: string;
    preferredLocale: "KO" | "EN";
  }>("/auth/me/locale", {
    preferredLocale,
  });

  if (current) {
    authStore.set({
      ...current,
      user: {
        ...current.user,
        preferredLocale: result.preferredLocale,
      },
    });
  }

  return result.preferredLocale;
}

// POST /auth/forgot-password — always resolves, even for an unknown address.
// The API deliberately gives no signal about whether the email is registered.
export async function forgotPassword(email: string): Promise<void> {
  await api.post("/auth/forgot-password", { email }, { auth: false });
}

// POST /auth/reset-password — consumes the token from the emailed link.
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  await api.post(
    "/auth/reset-password",
    { token, newPassword },
    { auth: false },
  );
}

// DELETE /auth/me — soft-delete own account. Clears local auth on success so
// the app drops to a logged-out state.
// POST /auth/become-host — 게스트 → 호스트 전환.
// The API returns a fresh token pair because guards read the role from the JWT;
// storing it here means the user can list a room without logging in again.
export async function becomeHost(): Promise<AuthUser> {
  const res = await api.post<AuthTokens>("/auth/become-host");
  authStore.set(res);
  return res.user;
}

// POST /auth/relinquish-host — HOST → GUEST. 등록한 숙소 중 예약·리뷰 이력이
// 없는 것은 삭제되고, 이력이 있는 것은 비공개로 전환된다. 진행 중인 예약이
// 있으면 서버가 400(HOST_HAS_ACTIVE_RESERVATIONS)으로 막는다.
export async function relinquishHost(): Promise<AuthUser> {
  const res = await api.post<AuthTokens>("/auth/relinquish-host");
  authStore.set(res);
  return res.user;
}

export async function deleteAccount(): Promise<void> {
  await api.delete("/auth/me");
  logout();
}

// POST /auth/change-password — the API verifies the current password and
// revokes existing refresh tokens on success.
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await api.post("/auth/change-password", { currentPassword, newPassword });
}

export type OAuthProvider = "google" | "kakao" | "naver" | "apple";

// Kick off an OAuth flow by navigating to the API's provider route.
//
// Render 무료 인스턴스는 한동안 요청이 없으면 잠들고, 이 리다이렉트가 그
// 첫 요청이 되는 경우 인스턴스가 아직 깨어나는 중이라 503으로 실패할 수
// 있다(실제로 재현됨: GET /auth/kakao 503 Service Unavailable). 백엔드에는
// 이미 이런 상황을 위한 /health 엔드포인트가 있으므로(DB를 건드리지 않고
// 즉시 응답 — 원래는 UptimeRobot 같은 외부 크론이 주기적으로 찔러서 인스턴스가
// 잠들지 않게 하는 용도), 리다이렉트 전에 먼저 그걸 찔러 인스턴스를 깨워두고
// 나서 이동한다. 깨우기가 실패하거나 시간 안에 안 끝나도 일단 이동은
// 시도한다 — 사용자가 화면에 갇히지 않도록.
export async function startOAuth(provider: OAuthProvider): Promise<void> {
  try {
    await fetchWithTimeout(`${API_BASE_URL}/health`, {}, 20000);
  } catch {
    // 못 깨워도 리다이렉트는 그대로 진행 — 아래에서 최선을 다해 이동한다.
  }
  window.location.href = `${API_BASE_URL}/auth/${provider}`;
}

// If the OAuth callback hands tokens back via the redirect (query/hash),
// call this on the landing page to store them.
export function completeOAuth(tokens: AuthTokens) {
  authStore.set(tokens);
}
