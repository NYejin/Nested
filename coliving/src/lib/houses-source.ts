// ── Houses data source (single source of truth) ─────────────────────
// Both the /api/houses Route Handler (used by the browse page) and the
// homepage server component import from here, so "where do listings come
// from" is decided in exactly one place.
//
// When USE_REAL_API is true we pull rooms from the live NestJS backend and
// adapt them to the House shape; otherwise we fall back to the in-repo demo
// seed so the app runs with no backend.

import { houses as demoHouses } from "@/lib/data";
import { USE_REAL_API, API_BASE_URL } from "@/lib/api/config";
import { apiRoomToHouse, type ApiRoom } from "@/lib/api/adapters";
import { fetchWithTimeout } from "@/lib/api/fetch-timeout";
import type { House } from "@/lib/types";

export async function loadHouses(): Promise<House[]> {
  if (USE_REAL_API) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/rooms`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const rooms: ApiRoom[] = Array.isArray(data) ? data : data.items ?? [];
        if (rooms.length > 0) return rooms.map(apiRoomToHouse);
      }
    } catch {
      // fall through to demo seed on any error
    }
  }
  return demoHouses;
}
