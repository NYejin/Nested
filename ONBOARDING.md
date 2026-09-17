# Nested — 로컬 실행 가이드

코리빙/쉐어하우스 플랫폼을 클론해서 로컬에서 띄우는 방법입니다.

## 1. 구조

```
nested-platform/
├── coliving/                   Next.js 15 (App Router) — 프론트엔드
│   ├── src/app/                페이지 (파일 = 라우트)
│   ├── src/lib/api/            ★ API 클라이언트 — 프론트↔백 경계
│   └── src/components/         공용 컴포넌트
│
└── nested-mono/apps/api/       NestJS — 백엔드
    ├── src/modules/            기능별 모듈 (rooms, auth, messages, admin …)
    ├── prisma/schema.prisma    DB 스키마
    └── docker-compose.yml      로컬 Postgres + Redis
```

**규칙 하나:** 프론트에서 백엔드를 부를 땐 반드시 `src/lib/api/*`를 거칩니다. 페이지에서 `fetch()`를 직접 쓰지 않습니다 — 인증 토큰 첨부·갱신·에러 처리가 거기 모여 있습니다.

## 2. 로컬 실행

### 사전 준비
- Node 20+
- Docker (로컬 DB용) — 없어도 됩니다. 회사·교육용 노트북은 BIOS 가상화가 IT 정책으로 막혀 Docker Desktop이 안 켜지는 경우가 흔합니다. 그럴 땐 아래 "Docker 없이 로컬 세팅" 참고.

### 백엔드

```bash
cd nested-mono/apps/api
npm install

docker compose up -d      # Postgres + Redis

cp .env.example .env
# DATABASE_URL, REDIS_URL은 기본값 그대로 두면 docker compose와 맞습니다.
# JWT_ACCESS_SECRET / JWT_REFRESH_SECRET만 아무 값이나 채우세요.
# 소셜 로그인·결제·업로드 키는 비워둬도 앱은 뜹니다 (해당 기능만 안 됨).

npx prisma generate
npx prisma migrate dev
npm run seed              # 샘플 데이터
npm run start:dev         # → http://localhost:4000
```

### Docker 없이 로컬 세팅

**PostgreSQL** — [postgresql.org](https://www.postgresql.org/download/windows/)에서 설치 후:
```sql
CREATE USER nested WITH PASSWORD 'nested';
ALTER USER nested CREATEDB;
CREATE DATABASE nested OWNER nested;
```
`.env`의 `DATABASE_URL`을 `postgresql://nested:nested@localhost:5432/nested?schema=public`로.

**Redis** — WSL(Ubuntu)에 설치:
```bash
wsl --install -d Ubuntu
sudo apt update && sudo apt install redis-server -y
sudo service redis-server start
redis-cli ping   # PONG
```
컴퓨터를 새로 켤 때마다 `wsl -d Ubuntu` → `sudo service redis-server start`가 필요합니다.

### 프론트엔드

```bash
cd coliving
npm install
cp .env.local.example .env.local
npm run dev            # → http://localhost:3000
```

`.env.local`의 `NEXT_PUBLIC_USE_REAL_API`:
- `true` → 로컬 백엔드와 통신 (백엔드가 떠 있어야 함)
- `false` → 백엔드 없이 데모 데이터로만 구동

## 3. 알아둘 것들

**Prisma 마이그레이션 순서를 지킵니다.** `schema.prisma` 수정 → `npx prisma migrate dev` → 생성된 마이그레이션 파일까지 커밋. 이 순서를 건너뛰면 로컬 DB엔 반영 안 된 채 코드는 새 필드를 참조하게 돼서 `P2022`(컬럼 없음) 에러가 납니다.

**권한(Role)은 JWT에 박혀 있습니다.** DB에서 role을 바꿔도 다시 로그인해야 반영됩니다.
```sql
UPDATE "User" SET role = 'HOST' WHERE email = '...';   -- HOST | ADMIN | GUEST
```

**새 숙소는 기본 미승인입니다** (`published: false`). 검색은 `published: true`만 조회하므로, 등록해도 관리자 승인 전엔 검색에 안 보입니다.

**사진 업로드는 Cloudinary가 기본 경로입니다.** 키가 없으면 파일 선택이 실패하고 "URL 붙여넣기"로 안내됩니다. AWS S3 + CloudFront 경로도 구현되어 있지만 현재 미사용입니다.

**주소는 서버에서 지오코딩합니다.** 클라이언트가 좌표를 직접 보내지 않습니다(주소와 다른 위치에 매물을 찍는 것을 방지). 정확한 주소는 공개 API 응답에서 제거됩니다.

## 4. 기능 구현 상태

전체 기능과 구현 상태는 [FEATURES.md](./FEATURES.md)에서 확인할 수 있습니다.
