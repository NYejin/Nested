// ── Rooms service ───────────────────────────────────────────────────
// One call site for room search + detail. When USE_REAL_API is true it hits
// the NestJS /rooms endpoints and adapts the response; otherwise it falls
// back to the in-repo demo Route Handlers so the app runs with no backend.

import { USE_REAL_API } from "./config";
import { api } from "./client";
import {
  filtersToApiQuery,
  apiSearchToPaginated,
  apiRoomToHouse,
  type ApiRoom,
  type ApiSearchResponse,
} from "./adapters";
import type {
  BuildingType,
  RentalUnit,
  RoomType,
  SharedFacility,
  GenderPolicy,
  AmenityKey,
} from "@/lib/types";
import type { AddressValue } from "@/components/AddressSearch";
import { filtersToParams } from "@/features/search/schema";
import type { SearchParams, PaginatedRooms, House } from "@/lib/types";

export async function searchRooms(
  filters: SearchParams,
  cursor?: string | null
): Promise<PaginatedRooms> {
  if (USE_REAL_API) {
    const params = filtersToApiQuery(filters);
    if (cursor) params.set("cursor", cursor);
    // 수정 — auth: false를 빼서, 로그인했으면 토큰이 자동으로 실려가게 함
    // (검색 자체는 비로그인도 가능해야 하므로 auth를 강제 true로 만들
    // 필요는 없음 — 기본값 자체가 "있으면 보내고 없으면 안 보낸다"이므로
    // 옵션을 아예 안 주는 게 정확히 원하는 동작이다. "내가 등록한 숙소"
    // 표시(isMine) 기능에 로그인 토큰이 필요해서 이렇게 바꿨다.)
    const res = await api.get<ApiSearchResponse>(`/rooms?${params.toString()}`);
    return apiSearchToPaginated(res);
  }

  // demo path — existing Next Route Handler
  const params = filtersToParams(filters);
  if (cursor) params.set("cursor", cursor);
  const r = await fetch(`/api/search?${params.toString()}`);
  if (!r.ok) throw new Error("search failed");
  return r.json();
}

export interface CreateRoomInput {
  name: string;
  region: string;
  address: AddressValue;
  verifiedByHost: true; // attestation; the API refuses anything else
  /** 신규 숙소 분류. roomType은 기존 데이터 호환용으로만 선택적으로 보낸다. */
  rentalUnit: RentalUnit;
  buildingType: BuildingType;
  sharedFacilities: SharedFacility[];
  genderPolicy: GenderPolicy;
  petsAllowed: boolean;
  smokingAllowed: boolean;
  parking: boolean;
  amenities: AmenityKey[];
  roomType?: RoomType;
  monthlyRent: number;
  deposit: number;
  cleaningFee: number;
  maintenanceFee: number;
  minStayMonths: number;
  availableFrom: string; // ISO date
  images: string[];
  /** 공유형 다인실의 침대·자리 수. 단독형·개인실은 null. */
  capacity?: number | null;
  /** 침실 개수 (선택) */
  bedrooms?: number | null;
}

// POST /rooms — host only. The current backend publishes a verified listing
// immediately; admins can later unpublish a problematic listing.
export async function createRoom(input: CreateRoomInput): Promise<{ id: string }> {
  return api.post<{ id: string }>("/rooms", {
    name: input.name,
    region: input.region,
    city: input.address.city,
    district: input.address.district,
    neighborhood: input.address.neighborhood,
    legalDongCode: input.address.legalDongCode,
    roadAddress: input.address.roadAddress,
    jibunAddress: input.address.jibunAddress,
    detailAddress: input.address.detailAddress,
    zipCode: input.address.zipCode,
    verifiedByHost: input.verifiedByHost,
    ...(input.roomType ? { roomType: input.roomType.toUpperCase() } : {}),
    rentalUnit: input.rentalUnit.toUpperCase(),
    buildingType: input.buildingType.toUpperCase(),
    sharedFacilities: input.sharedFacilities.map((facility) => facility.toUpperCase()),
    genderPolicy: input.genderPolicy.toUpperCase(),
    petsAllowed: input.petsAllowed,
    smokingAllowed: input.smokingAllowed,
    parking: input.parking,
    amenities: input.amenities,
    monthlyRent: input.monthlyRent,
    deposit: input.deposit,
    cleaningFee: input.cleaningFee,
    maintenanceFee: input.maintenanceFee,
    minStayMonths: input.minStayMonths,
    capacity: input.capacity ?? null,
    bedrooms: input.bedrooms ?? null,
    availableFrom: input.availableFrom,
    images: input.images,
  });
}

// GET /rooms/mine — my listings, including ones still awaiting approval.
// Search only ever returns published rooms, so this is the only way a host can
// see a listing they just submitted.
export interface HostInventorySummary {
  reservationCount: number;
  reservedSpots: number;
  remainingSpots: number | null;
  fullyBooked: boolean;
  blocked: boolean;
}

export interface HostCurrentInventory extends HostInventorySummary {
  representativeGuestName: string | null;
  additionalGuestCount: number;
  nextCheckIn: string | null;
  nextCheckOut: string | null;
}

export interface HostUpcomingInventory extends HostInventorySummary {
  checkIn: string;
  checkOut: string;
}

export interface HostListing extends House {
  published: boolean;
  reservationCount: number;
  currentInventory?: HostCurrentInventory;
  upcomingInventory?: HostUpcomingInventory | null;
}

export async function listMyRooms(): Promise<HostListing[]> {
  const rows = await api.get<(ApiRoom & {
    published: boolean;
    _count?: { reservations: number };
    currentInventory?: HostCurrentInventory;
    upcomingInventory?: HostUpcomingInventory | null;
  })[]>("/rooms/mine");
  return rows.map((r) => ({
    ...apiRoomToHouse(r),
    published: r.published,
    reservationCount: r._count?.reservations ?? 0,
    currentInventory: r.currentInventory
      ? {
          ...r.currentInventory,
          nextCheckIn: r.currentInventory.nextCheckIn?.slice(0, 10) ?? null,
          nextCheckOut: r.currentInventory.nextCheckOut?.slice(0, 10) ?? null,
        }
      : undefined,
    upcomingInventory: r.upcomingInventory
      ? {
          ...r.upcomingInventory,
          checkIn: r.upcomingInventory.checkIn.slice(0, 10),
          checkOut: r.upcomingInventory.checkOut.slice(0, 10),
        }
      : null,
  }));
}

// PATCH /rooms/:id — 호스트 본인 매물만. 서버가 소유권을 확인한다.
// 주소처럼 등록 흐름 전체(지오코딩)가 필요한 항목은 제외하고, 자주 손보는
// 값과 사진만 부분 수정으로 받는다. images를 보내면 서버가 기존 갤러리를
// 통째로 교체한다 — 순서 그대로, 부분 추가/삭제 개념은 없다.
export interface UpdateRoomInput {
  monthlyRent?: number;
  deposit?: number;
  cleaningFee?: number;
  maintenanceFee?: number;
  minStayMonths?: number;
  availableFrom?: string; // ISO date
  capacity?: number | null;
  rentalUnit?: RentalUnit;
  buildingType?: BuildingType;
  sharedFacilities?: SharedFacility[];
  genderPolicy?: GenderPolicy;
  petsAllowed?: boolean;
  smokingAllowed?: boolean;
  parking?: boolean;
  amenities?: AmenityKey[];
  bedrooms?: number | null;
  classificationReviewRequired?: boolean;
  images?: string[]; // full gallery, in display order — index 0 is the cover
}

export async function updateRoom(id: string, input: UpdateRoomInput): Promise<void> {
  await api.patch(`/rooms/${id}`, {
    ...input,
    ...(input.rentalUnit ? { rentalUnit: input.rentalUnit.toUpperCase() } : {}),
    ...(input.buildingType ? { buildingType: input.buildingType.toUpperCase() } : {}),
    ...(input.sharedFacilities
      ? { sharedFacilities: input.sharedFacilities.map((facility) => facility.toUpperCase()) }
      : {}),
    ...(input.genderPolicy
      ? { genderPolicy: input.genderPolicy.toUpperCase() }
      : {}),
  });
}

// DELETE /rooms/:id — 예약이 걸려 있으면 서버가 거부한다.
export async function deleteRoom(id: string): Promise<void> {
  await api.delete(`/rooms/${id}`);
}

export interface RoomAvailabilityDay {
  date: string;
  blocked: boolean;
  blockReason: string | null;
  beforeAvailableFrom: boolean;
  past: boolean;
  reservedSpots: number;
  remainingSpots: number | null;
  fullyBooked: boolean;
  available: boolean;
}

export interface RoomAvailabilityMonth {
  roomId: string;
  rentalUnit: string | null;
  capacity: number | null;
  availableFrom: string;
  requestedSpots: number;
  days: RoomAvailabilityDay[];
}

export async function getRoomAvailabilityMonth(
  roomId: string,
  year: number,
  month: number,
  requestedSpots = 1,
): Promise<RoomAvailabilityMonth> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
    requestedSpots: String(requestedSpots),
  });
  return api.get<RoomAvailabilityMonth>(
    `/rooms/${encodeURIComponent(roomId)}/availability?${params.toString()}`,
    { auth: false },
  );
}

export async function getRoom(id: string): Promise<House> {
  if (USE_REAL_API) {
    // homes/[id]는 force-dynamic SSR이라 Vercel 서버리스 함수 예산(300초) 안에서
    // 끝나야 한다. 백엔드가 느리거나 안 붙으면 빨리 실패해서 이 페이지의 기존
    // try/catch가 데모 데이터로 폴백하도록, 클라이언트 기본 타임아웃(25초)보다
    // 훨씬 짧게 지정한다.
    const r = await api.get<ApiRoom>(`/rooms/${id}`, {
      auth: false,
      timeoutMs: 8000,
    });
    return apiRoomToHouse(r);
  }
  // demo path — house detail is served from the local seed via /api/houses
  const r = await fetch(`/api/houses?id=${id}`);
  if (!r.ok) throw new Error("room not found");
  return r.json();
}

// GET /rooms/:id/similar — 비슷한 숙소 추천 (유사 숙소 추천)
// 같은 지역·방종류·가격대·편의시설이 겹치는 숙소를 최대 4개까지 점수 순으로
// 반환한다 (실제 점수 계산은 백엔드 rooms.service.ts의 findSimilar()에서 처리).
// 데모 모드(USE_REAL_API=false)에서는 비교할 실제 데이터가 없으므로 빈 배열 반환.
// 수정 — apiRoomToHouse()가 reasons를 버리기 때문에, 변환 후 다시 붙여준다.
export async function getSimilarRooms(id: string): Promise<(House & { reasons: string[] })[]> {
  if (!USE_REAL_API) return [];
  const rows = await api.get<(ApiRoom & { reasons: string[] })[]>(`/rooms/${id}/similar`, { auth: false });
  return rows.map((r) => ({ ...apiRoomToHouse(r), reasons: r.reasons ?? [] }));
}

// GET /rooms/age-group — 같은 연령대에게 인기 있는 숙소
// 또래가 찜한 숙소를 우선 집계하고, 표본이 모자라면 전체 인기순으로 채운다.
// ageGroup 은 20/30/40 같은 숫자로, 화면에서 "30대에게 인기 있는 숙소" 문구를 만든다.
export async function getAgeGroupRooms(): Promise<{
  rooms: House[];
  ageGroup: number | null;
}> {
  if (!USE_REAL_API) return { rooms: [], ageGroup: null };
  const res = await api.get<{
    rooms: ApiRoom[];
    ageGroup: number | null;
  }>("/rooms/age-group");
  return {
    rooms: res.rooms.map((r) => apiRoomToHouse(r)),
    ageGroup: res.ageGroup,
  };
}

// GET /rooms/personalized — 개인화 숙소 추천
// 찜 목록 기반으로 스코어링한 숙소 목록 + 로그인한 사용자 이름을 같이 받아온다.
// 이름은 홈 화면에서 "OOO님을 위한 숙소 추천!"이라는 타이틀을 만드는 데 쓰인다.
// 백엔드(rooms.service.ts의 getPersonalizedRooms())가 배열이 아니라
// { rooms, userName } 객체를 반환하므로, 그 형태를 그대로 따른다.
// 데모 모드(USE_REAL_API=false)나 비로그인 상태에서는 빈 결과로 처리.
export async function getPersonalizedRooms(): Promise<{
  rooms: (House & { personalizedReason: string | null })[];
  userName: string | null;
}> {
  if (!USE_REAL_API) return { rooms: [], userName: null };
  const res = await api.get<{
    rooms: (ApiRoom & { personalizedReason: string | null })[];
    userName: string | null;
  }>("/rooms/personalized");
  return {
    rooms: res.rooms.map((r) => ({ ...apiRoomToHouse(r), personalizedReason: r.personalizedReason })),
    userName: res.userName,
  };
}
