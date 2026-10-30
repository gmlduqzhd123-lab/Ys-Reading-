# 책숲 개발 환경과 운영 준비

2026-10-30 계정 운영 추가: `/operations`에서 담당 교사의 학생 일괄 발급·복구와 동의 근거 확인 요청을 지원한다. `/account`에는 첫 비밀번호 변경·참여 철회·전체 기록 삭제 요청이 있다. 운영자 승인·삭제 실행·학급 인계와 Supabase Edge Function 설정은 [계정·참여·기록 운영](ACCOUNT-OPERATIONS.md)을 우선한다. 기존 비밀키 도구는 초기 성인 교사·운영자 준비에 사용하고, 이후 교사의 웹 계정 발급에는 비밀키를 전달하지 않는다.

2026-10-30 갱신: 지정한 Supabase 프로젝트에 기본·4단계 기능의 DB 구조와 18개 미션을 반영하고, 가상 계정으로 실제 인증·활동·출력 연결을 검사했다. 로컬 `.env.local`은 비공개로 구성했다. Google OAuth 앱 설정, 실제 운영 계정 발급과 동의·보관 정책, 웹 호스팅·실제 수업 검증은 남아 있다. 새 기능의 설정은 [4단계 구현·운영 안내](FOUR-STAGES.md)를 먼저 확인한다. 아래의 2026-10-28 설명은 초기 작성 당시의 상태다.

새로 가져온 컴퓨터에서는 `.env.example`을 바탕으로 해당 개발 프로젝트의 URL과 publishable key를 설정한다. 계정 발급용 secret key는 운영자 스크립트에만 필요하며 채팅·저장소에 공유하지 않는다. 로컬 주소·포트는 `NEXT_PUBLIC_APP_URL`과 맞춘다. 이 작업 환경의 검증 주소는 `http://127.0.0.1:3086`이며 `npm run build`, `npm run start -- --port 3086`으로 실행했다.

## 현재 구현 범위

실제 Supabase 인증과 데이터베이스를 사용하는 첫 개발 버전입니다. 환경변수가 없으면 공개 소개·미션 안내 화면만 사용할 수 있고, 로그인과 학급 저장 기능은 실패 상태를 명시합니다. 샘플 학생으로 자동 대체하거나 저장 성공을 가장하지 않습니다.

2026년 10월 28일 작성 시점에는 원격 계정·프로젝트 선택이 완료되지 않아 실제 Supabase 연결, 원격 마이그레이션 적용, 콘텐츠 등록, 계정 생성, Vercel 배포를 실행하지 않았습니다. 아래 명령은 다음 연결 단계의 실행 안내입니다. 콘텐츠 등록 스크립트가 존재하는 것과 원격에 18개 미션이 실제 등록된 것은 구분합니다.

학생 계정은 담당 교사의 운영 화면에서 발급할 수 있습니다. 실제 보호자 신원·관계 확인과 동의 증빙 수집은 학교에서 진행하며, 교사의 확인 요청을 운영자가 심사하는 화면을 제공합니다. 개발 검증은 가상 학생만 사용했습니다.

## 실행 구성

- Node.js 24 이상과 npm을 사용합니다.
- 프로젝트와 계정은 작업 대상이 확인된 새 개발용 Supabase 및 Vercel 프로젝트를 사용합니다.
- 개발용 Supabase와 운영용 Supabase는 별도 프로젝트로 구성합니다.
- 기존의 다른 서비스 데이터베이스에 초기 마이그레이션을 실행하지 않습니다.
- dependencies 버전과 package-lock.json을 함께 관리합니다.

`.env.example`을 참고해 `.env.local`을 준비합니다. 값은 문서나 GitHub에 올리지 않습니다.

| 설정 이름 | 용도 |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | 개발용 Supabase URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 브라우저 사용이 허용되는 publishable key |
| NEXT_PUBLIC_APP_URL | 현재 앱의 URL |
| SUPABASE_SECRET_KEY | 운영자 계정 생성·콘텐츠 등록 도구에만 쓰는 서버 비밀키 |

웹앱의 일반 읽기·쓰기에는 서버 비밀키를 사용하지 않습니다. 인증된 사용자의 권한과 RLS를 적용합니다. 비밀키는 `NEXT_PUBLIC_` 설정에 절대 넣지 않습니다.

## 데이터베이스 설치

1. 사용할 새 개발 프로젝트를 확인합니다.
2. Supabase CLI의 현재 `--help`를 확인하고 프로젝트를 연결합니다.
3. `supabase/migrations`의 마이그레이션을 검토한 후 적용합니다.
4. `scripts/seed-missions.ts`로 직접 제작한 미션 콘텐츠를 등록합니다.
5. 운영자용 도구로 성인 시험 계정과 가상 학생 계정을 만듭니다.
6. 역할별 접근 제한, 중복 제출, 마감, 수정 버전, 배지 테스트를 통과한 뒤 실제 기기에서 검증합니다.

콘텐츠 등록 명령은 환경변수가 준비된 프로젝트 디렉터리에서 실행합니다.

```text
node --env-file=.env.local --import tsx scripts/seed-missions.ts
```

## 계정 준비

`scripts/provision-user.ts`는 서버 비밀키가 필요한 운영자 전용 도구입니다. 비밀번호는 명령줄 인수로 전달하지 않으며, 표준입력으로 전달한 단일 JSON 객체를 읽습니다. 프로그램은 비밀번호나 비밀키를 출력하지 않습니다. 이 도구를 일반 웹 API로 노출하지 않습니다.

입력 필드:

- 공통: `role`, `displayName`, `password`(12자 이상).
- 교사: `role=teacher`, `email`.
- 초기 운영자: 교사 입력에 `operator=true`를 명시합니다. 프로젝트 소유자가 신원을 확인한 계정만 준비합니다.
- 학생: `role=student`, `loginId`, 필요한 경우 `classroomId`.
- `testFixture=true`는 개발용 가상 학생에만 사용합니다. 별도로 `BOOKFOREST_ALLOW_TEST_FIXTURES=true`가 설정되어야 하며 표시 이름이 ‘테스트’로 시작해야 합니다.

학생의 로그인 ID는 내부 인증용 `loginId@students.bookforest.invalid` 식별자로 변환합니다. 이는 실제 학생의 이메일 주소가 아니며 메일 발송·비밀번호 복구 이메일에 사용하지 않습니다. 학생 로그인 ID는 시스템 전체에서 고유하게 발급합니다. 첫 버전에는 학급 코드 로그인이나 보호자 이메일 복구 화면이 없습니다.

학생 계정은 동의 상태 `pending`과 첫 비밀번호 변경 필요 상태로 생성됩니다. 운영자가 학교의 근거를 확인해 승인하기 전에는 학습 데이터를 이용할 수 없습니다. 테스트용 계정 활성화는 실제 보호자 동의 확인을 대신하지 않습니다.

```text
node --env-file=.env.local --import tsx scripts/provision-user.ts
```

일반 가입을 통한 교사 역할 자동 부여는 제공하지 않습니다. 역할은 운영자만 명시적으로 부여하며 사용자 프로필 메타데이터에서 읽지 않습니다. 학생 비밀번호 초기화와 법정대리인 확인은 후속 개발 항목입니다.

## 인증·저장 동작

- Supabase SSR의 쿠키 세션을 사용합니다.
- Next.js Proxy에서 세션을 갱신하며 인증 화면 응답에 비공개·저장 금지 헤더를 적용합니다.
- 서버 페이지와 각 변경 요청에서 `getUser()`로 인증을 다시 확인합니다.
- 데이터베이스 RPC가 담당 학급, 학생 소속, 동의 상태, 제출 버전, 마감을 추가 검사합니다.
- 자동저장 버전이 일치하지 않으면 충돌로 처리합니다.
- 제출·출품 요청은 요청 식별자를 사용해 중복 처리를 방지합니다.
- 학습 미션은 권장 마감 뒤에도 제출할 수 있고 `is_late`로 표시합니다. 대회 접수는 서버 마감 시각부터 차단합니다.
- 완료된 학습 글은 새 버전으로 다시 제출할 수 있으며 과거 완료본과 배지는 유지됩니다. 이미 접수한 대회 작품의 교체·철회와 심사 수정은 이 개발 버전에서 제공하지 않습니다.
- 학습 본문과 피드백은 로그에 기록하지 않습니다.
- `/api/health`는 구성 유무만 보여줍니다. 실제 DB 연결·마이그레이션 성공을 보장하는 점검은 아닙니다.

## 로컬 검사와 배포

```text
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Vercel 미리보기 환경에는 개발용 Supabase URL·publishable key를 설정합니다. 정식 배포는 운영용 프로젝트와 검증된 동의·보관 정책이 준비된 후 수행합니다. 계정 생성용 서버 비밀키는 일반 웹앱에 필요하지 않습니다.

아직 수행하지 않은 원격 검증을 완료로 기록하지 않습니다. 실제 시험 계정으로 로그인·제출·피드백·재제출·접수까지 확인해야 전체 연결이 검증된 것입니다.

## 확인한 공식 자료

- [Supabase Next.js SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs&queryGroups=framework)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Next.js 16.4.3에 포함된 `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `16-proxy.md`, `03-api-reference/04-functions/cookies.md`.
