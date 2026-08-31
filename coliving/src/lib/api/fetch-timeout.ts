// ── Bounded fetch ───────────────────────────────────────────────────
// Wraps fetch() with an AbortController-based timeout so a call to the
// real NestJS backend fails fast when it's unreachable, instead of hanging
// until the platform's own limit kicks in.
//
// This matters most for the SSR data loaders (`/`, `/homes/[id]`, …): a
// bare fetch() there blocks the whole serverless function until Vercel's
// own hard cap (300s on Hobby) kills it with FUNCTION_INVOCATION_TIMEOUT —
// even though every caller already has a try/catch ready to fall back to
// the demo seed on *any thrown error*. A short client-side timeout is what
// turns "backend down" into a normal caught error instead of a 5-minute
// hang. PushListener already uses this same pattern for its client-side
// polling fetch; this gives every real-backend call the same protection.
export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
