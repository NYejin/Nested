# Nested — 프론트엔드 ↔ 백엔드 연결 가이드

프론트(`coliving`, Next.js 15)와 백엔드(`nested-mono/apps/api`, NestJS)를 실제로 연결했습니다.
화면 33개는 **한 줄도 고치지 않고**, 얇은 연결 레이어(어댑터)만 추가하는 방식입니다.
환경변수 하나로 **실서버 모드 ↔ 오프라인 데모 모드**를 전환합니다.

---

## 1. 왜 어댑터가 필요했나 — 계약 불일치

프론트와 백엔드는 각자 발전해서 계약이 조금씩 어긋나 있었습니다. 그대로 URL만 바꾸면 깨집니다.

| 항목 | 프론트(기존) | 백엔드 | 해결 |
|------|------|--------|------|
| enum 표기 | `one_room`, `any` (소문자) | `ONE_ROOM`, `ANY` | 어댑터에서 양방향 변환 |
| 검색 응답 | `{items, nextCursor, total}` + 평탄 `House` | `{items, nextCursor}` + Prisma 중첩(`images[]`) | `apiRoomToHouse()`로 평탄화 |
| 검색 필터 | `roomTypes[]·gender·smoking·parking·sort` | `roomType`·`petsAllowed`만 | 백엔드 검색 확장 + 파라미터 매핑 |
| 예약 흐름 | `request → pay` (2단계) | `quote → create → confirm` (3단계) | 예약 서비스에서 매핑 |
| 채팅 | 1.2초 폴링 | Socket.io `/chat` | 하이브리드 훅(소켓/폴링) |
| 인증 | 없음 | JWT access(15m)/refresh(7d) | 토큰 스토어 + 자동 refresh |

---

## 2. 추가된 연결 레이어 (프론트)

```
coliving/src/lib/api/
├── config.ts          # API URL + USE_REAL_API 토글
├── auth-store.ts      # JWT 토큰 저장(메모리+localStorage), 구독 가능
├── client.ts          # fetch 래퍼: Bearer 주입 + 401 시 단일비행 refresh·재시도
├── adapters.ts        # enum·필터·Room↔House 변환 (번역 경계)
├── rooms.ts           # 검색·상세 (실서버/데모 자동 분기)
├── auth.ts            # register/login/logout/me + OAuth 리다이렉트
├── useAuth.ts         # React 훅 (useSyncExternalStore)
├── reservations.ts    # quote/create/confirm/cancel 매핑
└── socket.ts          # Socket.io /chat 클라이언트
```

수정된 기존 파일:
- `features/search/api/useSearchProperties.ts` → `searchRooms()` 사용
- `components/BookingWidget.tsx` → 예약 서비스 3함수 사용
- `features/chat/useChatRoom.ts` → 소켓/폴링 하이브리드
- `package.json` → `socket.io-client` 추가

## 3. 수정된 백엔드

- `modules/rooms/rooms.service.ts` — 검색에 `roomTypes[]·gender·smoking·parking·sort·availableFrom·total` 지원 추가
- `modules/rooms/rooms.controller.ts` — 새 쿼리 파라미터 파싱
- `main.ts` — CORS를 `CORS_ORIGINS` 환경변수 기반으로 (프론트 origin 허용)
- `.env.example` — `CORS_ORIGINS` 추가

---

## 4. 실행 방법

### A. 오프라인 데모 (백엔드 불필요 — 발표용)
```bash
cd coliving
npm install
npm run dev            # http://localhost:3000
```
`NEXT_PUBLIC_USE_REAL_API`가 없으면 기존 `/api` 데모 라우트로 동작합니다.

### B. 실서버 연결
```bash
# 1) 백엔드
cd nested-mono/apps/api
npm install
docker compose up -d          # Postgres + Redis
cp .env.example .env          # CORS_ORIGINS=http://localhost:3000 확인
npx prisma generate           # 인터넷 필요
npx prisma migrate dev
npm run seed
npm run start:dev             # :4000

# 2) 프론트
cd coliving
cp .env.local.example .env.local
#   NEXT_PUBLIC_USE_REAL_API=true 로 변경
npm run dev                   # :3000 → :4000 호출
```

---

## 5. 요청 흐름 (실서버 모드)

```
검색   UI 필터 ─filtersToApiQuery→ GET /rooms?roomTypes=ONE_ROOM&… 
             ─apiRoomToHouse→ PropertyCard (House)

예약   BookingWidget
         날짜변경 → POST /reservations/quote      (가격+가능여부, 서버가 권위)
         예약요청 → POST /reservations            (PENDING_PAYMENT hold)
         결제하기 → POST /payments/confirm         (PSP 검증)

채팅   useChatRoom → socket.io(/chat)
         emit message:send / message:read / typing
         on   message:new / message:read / typing

인증   login → {accessToken, refreshToken, user} → authStore
         이후 모든 요청에 Bearer 자동 주입
         401 → /auth/refresh 로 회전 후 재시도(단일 비행)
```

---

## 6. 검증 결과

| 항목 | 결과 |
|------|------|
| 프론트 빌드 | ✓ 61개 라우트 전체 성공 |
| 프론트 타입체크 | ✓ tsc exit 0 |
| 백엔드 타입체크 | ✓ tsc exit 0 |
| 백엔드 테스트 | ✓ 24/24 통과 |
| 어댑터 왕복 매핑 | ✓ 9/9 체크 통과 |

*Prisma generate/migrate는 인터넷 연결된 환경에서 실행하세요 (엔진 다운로드 필요).*
