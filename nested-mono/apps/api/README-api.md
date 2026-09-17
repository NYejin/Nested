# @nested/api — NestJS 백엔드

Prisma + PostgreSQL + Redis + Socket.io 기반 NestJS 백엔드. 20개 기능 모듈로 구성됩니다.

## 스택

- **NestJS 10** + TypeScript (strict)
- **Prisma ORM** — `prisma/schema.prisma`, 모델 35개, enum 31개
- **REST** — 모듈별 컨트롤러 (일부는 `*.controller.ts`로 분리, 일부는 `*.module.ts` 안에 인라인)
- **GraphQL** (옵션) — code-first `RoomsResolver`, Apollo 드라이버, 자동 스키마
- **JWT** — `@nestjs/jwt` access(15분)/refresh(7일) 토큰, `JwtStrategy`, `JwtAuthGuard`
- **OAuth 4종** — Google, Kakao, Naver, Apple (모두 `validateOAuthUser()`로 find-or-create + 이메일 링크)
- **Redis** (`ioredis`, `RedisService`) — 캐시 + Socket.io pub/sub 어댑터. ~~BullMQ~~는 2026-07-27 제거됨(Upstash 무료 티어 요청 할당량을 유휴 상태에서도 계속 소진해서 뺐습니다 — `notifications.module.ts` 주석 참고). 현재 알림은 큐 없이 직접 처리되며, push/email 실제 프로바이더(FCM/SES 등) 연동은 아직 없습니다.
- **Socket.io** — `ChatGateway`(`/chat` 네임스페이스), `notifications.gateway.ts` — Redis 어댑터로 스케일
- **결제** — `POST /payments/confirm`에서 Toss / PortOne / Stripe 중 하나를 서버사이드로 검증(`psp-payment.gateway.ts`). 클라이언트가 보낸 성공 응답을 그대로 믿지 않고 PSP에 재확인합니다.
- **이미지 업로드** — Cloudinary가 실제 사용 경로(`POST /storage/cloudinary-signature`로 서명 후 브라우저가 직접 업로드). AWS S3 + CloudFront presign(`POST /storage/presign`)도 구현돼 있으나 현재 미설정 상태의 대안 경로입니다.

## 모듈 (20개)

```
src/modules/
  auth/            # JWT + OAuth 4종, 가드(Jwt/Google/Kakao/Naver/Apple)
  users/           # 공개 프로필, 뱃지
  preference/      # 성향 데이터(RoommatePreference, 9개 축)
  match/           # 룸메이트 매칭 (scoreMatch, 9축 가중치 + 3축 하드필터)
  rooms/           # 숙소 CRUD, 검색, 유사 숙소 추천(findSimilar)
  reservations/    # quote → create → confirmPayment
  reviews/         # 리뷰 + tenant-review(세입자 리뷰, 뱃지)
  messages/        # 다이렉트 메시지
  chat/            # Socket.io 채팅 게이트웨이
  friends/         # 친구 요청/수락/거절
  favorites/       # 찜하기(Wishlist/Favorite)
  coupons/         # 쿠폰 + 생일 쿠폰
  notifications/   # 실시간 알림 게이트웨이
  notifications-api/  # 알림 조회/읽음/삭제 REST
  inquiries/       # 문의함
  reports/         # 신고 관리
  admin/           # 회원/숙소승인/공지/배너/쿠폰/휴지통/대시보드/매출
  host/            # 호스트 대시보드/캘린더/정산/연체/수익 CSV 내보내기
  community/       # 게시글/댓글 (Post, Comment)
  transit/         # 다중 이동수단 API (ODSAY 미사용 — README 결정 사항 참고)
  storage/         # Cloudinary/S3 업로드
```

## 인증 — 6가지 로그인 경로

- **이메일** — `POST /auth/register`, `POST /auth/login` (bcryptjs)
- **Google** — `GET /auth/google` → `GET /auth/google/callback`
- **Kakao** — `GET /auth/kakao` → `GET /auth/kakao/callback`
- **Naver** — `GET /auth/naver` → `GET /auth/naver/callback`
- **Apple** — `GET /auth/apple` → `POST /auth/apple/callback`
- **JWT Refresh** — access(15분)/refresh(7일). Refresh 토큰은 해시(SHA-256) 저장, `POST /auth/refresh`가 회전(기존 삭제+신규 발급), `logoutAll(userId)`로 전체 세션 무효화

## 데이터 모델 (35개)

`prisma/schema.prisma` 전체 모델:

User · RefreshToken · PasswordResetToken · EmailVerificationToken · Room · Property · HostProfile · Image · Reservation · ContractChangeRequest · ReservationCompanionMember · Payment · Review · Message · FriendRequest · Friendship · DirectConversation · DirectMessage · Coupon · Notification · Wishlist · Favorite · Inquiry · Report · Amenity · RoomAmenity · ChatRoom · CalendarBlock · Settlement · Post · Comment · RoommatePreference · Notice · Banner · TenantReview

## 주요 REST 엔드포인트 (대표 예시 — 전체 라우트는 각 모듈 컨트롤러 참고)

| 도메인 | 엔드포인트 |
|---|---|
| 인증 | `POST /auth/register`, `/login`, `/refresh`, `GET /auth/me`, `PATCH /auth/me`, `DELETE /auth/me`, `POST /auth/change-password`, `/forgot-password`, `/reset-password` |
| OAuth | `GET /auth/{google,kakao,naver,apple}`, `.../callback` |
| 성향 | `GET/PUT /me/preference` |
| 매칭 | `GET /match`, `GET /match/:userId` |
| 숙소 | `GET/POST /rooms`, `PATCH/DELETE /rooms/:id`, `GET /rooms/:id/similar`(유사 숙소) |
| 예약 | `POST /reservations/quote`, `POST /reservations`, `GET /reservations/:id`, `PATCH /reservations/:id/cancel`, `GET /reservations/host` |
| 결제 | `POST /payments/confirm` |
| 리뷰 | `GET /reviews?roomId=`, `POST /reviews`, `GET /reviews/mine`, `GET /reviews/received` |
| 알림 | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `DELETE /notifications/:id` |
| 호스트 | `GET /host/dashboard`, `GET /host/export/{revenue,tenants}.csv`, `GET /host/settlements` |
| 관리자 | `GET /admin/stats`, `GET /admin/revenue/monthly`, `/admin/revenue-trend-v2`, `PATCH /admin/members/:id/{verify,role,suspend}`, `PATCH /admin/reports/:id`, `admin/notices`, `admin/banners`, `admin/coupons` CRUD, `admin/trash` |
| 스토리지 | `POST /storage/presign`, `POST /storage/cloudinary-signature`, `DELETE /storage/:key` |

Auth: 보호된 라우트는 JWT bearer 필요, 관리자/호스트 전용 라우트는 `@Roles("HOST"|"ADMIN")`.

## 로컬 실행

```bash
npm install
docker compose up -d          # Postgres + Redis
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run seed
npm run start:dev             # :4000, 테스트: npm test
```

## 참고

- `bcryptjs`(순수 JS)를 써서 네이티브 빌드가 필요 없습니다.
- Prisma client 생성은 쿼리 엔진 다운로드에 네트워크가 필요합니다.
- 전체 아키텍처는 [../../README.md](../../README.md), 프론트-백엔드 연결은 [../../INTEGRATION.md](../../INTEGRATION.md) 참고.
