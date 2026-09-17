# Nested — Frontend (Next.js App Router)

공유주거 플랫폼의 프론트엔드입니다. 백엔드 없이 단독 실행되는 데모 모드와, 실제 NestJS API에 붙는 실서버 모드를 하나의 코드베이스로 지원합니다.

## 실행 방법

동작 모드는 `src/lib/api/config.ts`의 `USE_REAL_API` 플래그로 전환합니다 (`.env.local`의 `NEXT_PUBLIC_USE_REAL_API`).

```bash
# 오프라인 데모 — 백엔드 없이, 자체 Route Handlers(src/app/api/*) + 인메모리 스토어 사용
npm install
npm run dev      # http://localhost:3000

# 실서버 연결 — .env.local에서 NEXT_PUBLIC_USE_REAL_API=true
# 먼저 ../nested-mono/apps/api 를 :4000 포트로 띄워야 합니다.
```

## 기능

1. **숙소 찾기** (`/browse`, `/homes/[id]`) — 실시간 검색, 방종류/분위기/예산 필터, 정렬, 지도 연동
2. **룸메이트 매칭** (`/match`) — 오프라인 데모 모드는 `src/lib/matching.ts`(수면 패턴·정리정돈·사교성·공통 관심사·라이프스타일 dealbreaker 기준)를, 실서버 모드는 백엔드의 9축 균등가중치 + 3축(흡연/반려동물/방문객) 하드필터 매칭 엔진(`scoreMatch()`)을 사용합니다. 두 로직은 서로 다른 별개 구현입니다 — 자세한 기준은 [../FEATURES.md](../FEATURES.md)의 A-2 참고.
3. **커뮤니티** (`/community`) — 공지/이벤트/집안일/마켓/채팅 카테고리, 게시글 작성·고정
4. **예약·결제** (예약 위젯 + `/trips`) — 보증금+첫달+청소비+한달관리비+5% 서비스 수수료 원장, 예약 관리·취소. 실서버 모드에서는 실제 결제 승인 플로우(`quote → create → confirm`)로 연결됩니다.
5. **호스트/관리자 도메인** — 숙소 등록·수정, 예약/정산/연체 관리, 회원·신고·쿠폰·공지·배너 관리, 대시보드 KPI

## 아키텍처

- **프레임워크**: Next.js 15 (App Router), React 19, TypeScript, TailwindCSS
- **데모 백엔드**: `src/app/api/*` Route Handlers(`houses`, `match`, `posts`, `bookings`, `chat`, `search`, `availability`) + 인메모리 스토어(`src/lib/store.ts`) + 시드 데이터(`src/lib/data.ts`)
- **실서버 연결**: `src/lib/api/*` — `config.ts`(URL·플래그), `client.ts`(fetch 래퍼, Bearer 토큰 주입 + 401 시 refresh), `auth-store.ts`, 도메인별 어댑터(`rooms.ts`, `reservations.ts`, `admin.ts` 등). 프론트에서 백엔드를 부를 땐 반드시 이 경로를 거칩니다 — 페이지에서 `fetch()`를 직접 쓰지 않습니다.
- **상태 관리**: Zustand, TanStack Query
- **폼**: React Hook Form + Zod
- **실시간**: Socket.io Client (`src/features/chat/`, `NotificationBell.tsx`)

## 디자인 시스템

Palette: paper (#f7f5f0), ink (#1f2420), sage (#5c7457), ochre accent (#b4703b).
Type: Fraunces (display) + Inter (body) + Spline Sans Mono (data).
다크모드·reduced-motion·키보드 포커스를 전반적으로 지원합니다.

## 참고 문서

- [../README.md](../README.md) — 전체 저장소 구조, 듀얼 모드 설명
- [../INTEGRATION.md](../INTEGRATION.md) — 프론트 ↔ 백엔드 어댑터 상세
- [../ONBOARDING.md](../ONBOARDING.md) — 로컬 실행 가이드
