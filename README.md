# Nested — 공유주거(코리빙) 플랫폼

생활 성향 데이터로 룸메이트·숙소를 매칭하고, 예약·결제·정산·커뮤니티까지 관리하는 공유주거 플랫폼입니다.

## 구조

```
nested-platform/
├── coliving/          # 프론트엔드 — Next.js 15 · React 19
├── nested-mono/       # 백엔드 모노레포
│   ├── apps/api/      #   NestJS API — Prisma · PostgreSQL · Redis · Socket.io
│   ├── packages/ui/   #   공용 UI 컴포넌트 라이브러리 (Atomic Design)
│   └── showcase/      #   UI 컴포넌트 비주얼 갤러리
├── docs/
│   └── reservation-platform-erd.md   # ERD 문서 (schema.prisma 기준)
├── INTEGRATION.md     # 프론트 ↔ 백엔드 연결 가이드 (어댑터 레이어)
├── FEATURES.md        # 기능 정의서 — 도메인별 구현 상태
├── ISSUES.md          # 향후 개선 방향
└── ONBOARDING.md      # 로컬 실행 가이드
```

## 듀얼 모드 아키텍처

`coliving/`는 두 가지 모드로 동작합니다 (`coliving/src/lib/api/config.ts`의 `USE_REAL_API` 플래그로 전환):

- **오프라인 데모 모드** (`USE_REAL_API=false`, 기본값) — 백엔드 없이 `coliving/src/app/api/*`의 자체 Route Handlers + 인메모리 스토어로 동작. 프레젠테이션·시연용.
- **실서버 모드** (`USE_REAL_API=true`) — `nested-mono/apps/api`(NestJS)를 실제로 호출. 프로덕션 경로.

두 모드는 화면(33개)을 공유하고, `coliving/src/lib/api/*` 어댑터 레이어가 계약 차이(enum 표기, 응답 구조, 인증 등)를 흡수합니다. 자세한 내용은 [INTEGRATION.md](./INTEGRATION.md) 참고.

## 빠른 시작

### 오프라인 데모 (백엔드 불필요)

```bash
cd coliving
npm install
npm run dev            # http://localhost:3000
```

### 실서버 연결

```bash
# 백엔드
cd nested-mono/apps/api
npm install
docker compose up -d          # Postgres + Redis (Docker Desktop 필요)
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run seed
npm run start:dev             # :4000

# 프론트 (다른 터미널)
cd coliving
cp .env.local.example .env.local   # NEXT_PUBLIC_USE_REAL_API=true 로 변경
npm run dev                        # :3000
```

> Docker Desktop이 가상화 오류로 안 켜지면 `ONBOARDING.md`의 "Docker 없이 로컬 세팅" 절을 참고하세요.

## 기술 스택

**프론트엔드** — Next.js 15, React 19, TypeScript, TailwindCSS, TanStack Query, Zustand, React Hook Form, Zod, Framer Motion, Socket.io Client

**백엔드** — NestJS 10, Prisma ORM(PostgreSQL, 모델 35개), Redis(캐시 + Socket.io pub/sub 어댑터), Socket.io, GraphQL(옵션, code-first), JWT + OAuth 4종(Google·Kakao·Naver·Apple), Cloudinary(이미지 업로드 — 실제 사용 경로), AWS S3 + CloudFront presign(대안 구현, 현재 미설정)

> BullMQ는 한때 알림 큐로 쓰였으나 2026-07-27 제거됨 — Upstash Redis 무료 티어 요청 할당량을 작업이 없어도 계속 소진해서 뺐습니다 (`notifications.module.ts` 주석 참고).

**배포** — `master` 푸시 시 Vercel(프론트) + Render(백엔드) 자동 배포. Render는 로컬보다 엄격한 빌드(`noUncheckedIndexedAccess`)를 쓰므로 백엔드를 고치면 푸시 전에 `npm run build`로 먼저 확인하는 게 안전합니다.


## 팀 개발 가이드

`master`에 직접 푸시하지 않고 기능 브랜치(`feat/`, `fix/`, `refactor/`, `docs/`) → PR → CI(`.github/workflows/ci.yml`, 백엔드/프론트 병렬 타입체크·테스트·빌드) 통과 후 병합합니다.

`.env`는 커밋하지 않고 `.env.example`을 기준으로 각자 로컬에 채웁니다. 새 환경변수를 추가하면 `.env.example`에도 반드시 추가하세요.

## 참고 문서

- [FEATURES.md](./FEATURES.md) — 도메인별 구현 상태
- [ISSUES.md](./ISSUES.md) — 향후 개선 방향
- [ONBOARDING.md](./ONBOARDING.md) — 로컬 실행 가이드
- [INTEGRATION.md](./INTEGRATION.md) — 프론트 ↔ 백엔드 연결 가이드
- [docs/reservation-platform-erd.md](./docs/reservation-platform-erd.md) — ERD
- [nested-mono/README.md](./nested-mono/README.md) — 백엔드 모노레포(apps/api, packages/ui, showcase) 개요
- [coliving/README.md](./coliving/README.md) — 프론트엔드 상세
