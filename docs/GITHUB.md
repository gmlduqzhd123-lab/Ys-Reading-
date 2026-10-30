# GitHub 소스 연결

2026-10-30 사용자가 지정한 저장소는 [gmlduqzhd123-lab/Ys-Reading-](https://github.com/gmlduqzhd123-lab/Ys-Reading-)이며 기본 브랜치는 `main`이다. 소스·개발 문서·GitHub Actions 검사를 연결했다. 이후 사용자가 선택한 Supabase 개발 프로젝트에 DB 구조와 미션을 반영했다. 웹 호스팅 배포는 별도 단계다. 최신 기능·검증 범위는 `FOUR-STAGES.md`와 `VERIFICATION.md`를 참고한다.

프로젝트 파일은 저장소 루트에 둔다. 다른 컴퓨터에서 가져오려면 이 공개 저장소에 접근할 수 있는 GitHub 계정으로 인증한 뒤 아래 순서로 실행한다.

```sh
git clone https://github.com/gmlduqzhd123-lab/Ys-Reading-.git
cd Ys-Reading-
npm ci
npm run check
npm run start
```

데이터베이스 설정 없이 홈·미션·책숲 놀이터를 사용할 수 있다. 실제 학급·인증 기능은 `SETUP.md`의 후속 연결 절차가 필요하다.

`.github/workflows/check.yml`은 `main`에 반영하거나 PR을 만들 때 타입 검사·자동 검사·빌드를 실행한다. 외부 서비스의 토큰이나 배포 설정은 필요하지 않다. 자동 검사 결과는 GitHub의 Actions에서 확인한다.

Codex에서는 연결된 GitHub 계정을 이용해 소스를 동기화한다. 터미널에서 직접 `git push`를 사용하려면 해당 컴퓨터의 Git 인증이 별도로 필요하다. 인증 토큰을 저장소 URL이나 문서에 넣지 않는다.

`.env.local`, 비밀키, `node_modules`, `.next`, `.vercel`, 작업용 임시 파일은 업로드 대상에서 제외한다. `.env.example`은 값이 없는 설정 이름 안내 파일이다. 이번 연결은 서비스의 공개 배포나 실제 학생 운영 시작을 의미하지 않는다.
