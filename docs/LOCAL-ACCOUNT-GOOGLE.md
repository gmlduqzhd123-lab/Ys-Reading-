# 로컬 운영 계정과 Google 연결

2026-10-31 기준. 사용자의 결정으로 Vercel 연동과 웹 공개 배포는 보류했다. 현재 앱 주소는 `http://127.0.0.1:3086`이며 실행 중인 이 컴퓨터에서만 접속한다.

## Google 또는 이메일로 최초 운영자 등록

Supabase Auth의 Google 제공자를 활성화한 환경에서는 같은 로그인 영역의 **Google로 선생님·운영자 로그인**을 사용한다. `GOOGLE_AUTH_ENABLED=true`는 해당 제공자를 실제로 활성화한 뒤에만 설정한다. 서버는 지정된 Supabase 프로젝트의 로그인 주소와 고정 콜백만 사용하며, Google 로그인도 아래의 확인 완료 이메일·운영자 초대 검사를 그대로 거친다. Google 로그인만으로 일반 가입자가 교사가 되지는 않는다.

로그인 화면의 **선생님·운영자 처음 시작하기**에서 실제 이메일로 로그인 링크를 요청한다. 같은 브라우저에서 가장 최근 인증 메일의 링크를 열면 `/auth/callback`이 PKCE 코드를 교환하고 Supabase에서 확인한 사용자 신원을 조회한다.

프로젝트 소유자는 신뢰된 관리 연결로 `private.operator_email_invitations`에 이메일·표시 이름·만료 시각을 예약한다. 예약은 GitHub의 SQL 파일에 실제 이메일을 넣지 않고 원격 DB에만 기록한다. 현재 준비한 예약은 7일간 유효하다. `complete_operator_email_setup()`은 **Auth의 실제 확인 완료 이메일**, 계정 상태, 미소비·미만료 예약을 대조한다. 학생으로 발급받거나 학급에 등록된 계정은 운영자로 전환하지 않는다. 일반 가입자·사용자 편집 metadata·다른 이메일은 권한을 얻지 못한다. 이미 소비된 예약은 소유자가 나중에 회수한 운영자 권한을 복구하지 않는다.

Supabase Auth URL Configuration은 다음 로컬 값으로 맞췄다.

- Site URL: `http://127.0.0.1:3086`
- 허용 Redirect URL: `http://127.0.0.1:3086/auth/callback`

인증 메일 발송은 실제 소유 확인을 위한 요청이다. 메일 발송 성공만으로 로그인이나 운영자 등록 완료를 표시하지 않는다. 브라우저를 바꾸면 PKCE 확인 정보가 없어 다시 요청해야 할 수 있다. 메일의 링크·코드·비밀번호는 채팅에 전달하지 않는다. 실제 등록 완료 여부는 DB의 예약 소비 시각과 운영자 레지스트리, 앱 운영 화면으로 확인한다.

이번 실제 이메일 로그인에서는 `otp_expired`와 재요청 발송 제한이 확인됐다. 만료 원인을 추측해 확정하지 않으며 반복 발송하지 않는다. Google 본인 확인 경로를 추가해 메일 요청 없이 로그인할 수 있게 했다. 동의 화면 도착과 실제 계정 활성화는 별도로 확인한다.

## Google 로컬 설정

- Google Cloud 프로젝트: **Bookforest Reading** (`ys-reading-bookforest`).
- OAuth 앱: **책숲 Bookforest**, 외부 사용자·테스트 모드.
- 웹 OAuth 클라이언트: **책숲 로컬 개발**.
- 허용 OAuth 리디렉션: `http://127.0.0.1:3086/api/google/callback`.
- Google 로그인용 추가 리디렉션: `https://rbtqtkjnqtcnljvabisa.supabase.co/auth/v1/callback`. Supabase 제공자에는 같은 클라이언트를 설정하며 nonce 검사와 이메일 필수 조건을 유지한다.
- 사용하는 API: **Google Drive API**. DOCX/CSV를 Google 문서·시트로 변환하며 앱에서 만든 파일만 다루는 `drive.file` 범위를 요청한다.
- 클라이언트 ID·비밀키·무작위 32바이트 암호화 키는 Git에서 제외된 `.env.local`에 저장한다. 브라우저 코드·채팅·로그·GitHub에 비밀값을 출력하지 않는다.

Google에서 받은 웹 클라이언트 JSON을 가져올 때는 다음 도구를 사용할 수 있다. 인수는 파일 경로와 공개 프로젝트 ID이며 비밀키를 명령줄에 넣지 않는다.

```text
node scripts/configure-google.mjs <다운로드한-클라이언트-JSON-경로> ys-reading-bookforest
```

도구는 프로젝트 ID, 정확한 콜백, Google 인증·토큰 엔드포인트와 키 형식을 확인한 뒤 비공개 환경 파일을 갱신한다. 기존 암호화 키를 임의로 바꾸지 않는다. 설정 후 앱을 다시 빌드·시작한다. 배포용 주소는 아직 설정하지 않는다.

교사로 로그인한 뒤 **기록·글 내보내기 → Google 연결**에서 실제 Google 계정의 동의를 진행한다. 테스트 사용자 등록·API 활성화·환경 설정과 실제 OAuth 동의·파일 생성 검증은 서로 다른 단계다. 연결 완료 화면과 실제 Google 파일 반환을 확인하기 전에는 내보내기까지 검증됐다고 표시하지 않는다. OAuth 앱의 테스트 모드 제한은 Google에서 관리한다.

책숲 계정에 로그인하는 Google 동의(이름·프로필·이메일)와 Drive 내보내기 동의(`drive.file`)는 목적과 범위가 다르다. 로그인 성공만으로 Drive 연결 완료를 표시하지 않는다.

## 실행과 향후 배포

```text
npm ci
npm run check
npm run start -- --port 3086
```

공개 배포를 재개하면 확정한 HTTPS 주소를 앱의 `NEXT_PUBLIC_APP_URL`, Supabase Auth Site/Redirect URL, Google OAuth 콜백에 함께 반영한다. 로컬 콜백이 그대로 공개 배포에 적용된 것으로 간주하지 않는다.
