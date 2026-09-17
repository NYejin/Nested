# nested-mono — 백엔드 모노레포

세 개의 독립 npm 프로젝트로 구성됩니다. 루트 통합 `package.json`은 없고, 각 폴더에서 개별적으로 `npm install`합니다.

## `apps/api` — NestJS 백엔드

실제 프로덕션 API. Prisma(PostgreSQL) + Redis + Socket.io 기반 NestJS 서버로, 인증·숙소·예약·결제·매칭·채팅·관리자 등 20개 모듈을 포함합니다. 상세 내용은 [apps/api/README-api.md](./apps/api/README-api.md) 참고.

- 로컬 실행: `cd apps/api && npm install && docker compose up -d && npx prisma migrate dev && npm run start:dev`
- 테스트: `npm test`

## `packages/ui` — 공용 UI 컴포넌트 라이브러리

Atomic Design 기반 컴포넌트 라이브러리(shadcn 스타일), Radix 프리미티브 + `class-variance-authority` 기반. 코럴(#FF5A5F)/틸(#00A699) 브랜드 팔레트를 CSS 변수 + Tailwind preset으로 테마링합니다. 다크모드, WCAG AA 포커스 링, reduced-motion 지원.

- **Tokens** — `src/tokens/`
- **Atoms** — Avatar, Badge, Button, Input, Rating
- **Molecules** — Breadcrumb, MessageBubble(읽음 표시 포함), SearchBar, Tabs
- 타입체크: `cd packages/ui && npm install && npx tsc --noEmit`

## `showcase` — 컴포넌트 비주얼 갤러리

`packages/ui`의 컴포넌트를 브라우저에서 직접 확인할 수 있는 Next.js 갤러리 앱.

```bash
cd showcase && npm install && npm run dev
```

## 참고

- 이 폴더의 실제 서비스 코드는 `apps/api`뿐입니다. `packages/ui`와 `showcase`는 별도의 컴포넌트 라이브러리와 그 갤러리이며, **`coliving/`(메인 프론트엔드)은 이 라이브러리를 import하지 않습니다** — `coliving/package.json`에 의존성이 없고, 소스에서도 참조를 찾을 수 없습니다. 즉 `packages/ui`/`showcase`는 현재 실제 서비스와 분리된 독립 컴포넌트 라이브러리입니다.
- 전체 저장소 구조는 [../README.md](../README.md) 참고.
