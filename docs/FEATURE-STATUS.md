# 책숲 기능·준비 현황 · 0.8.1

이 문서는 `config/feature-status.json`에서 자동 생성합니다. `implemented`는 코드와 검사 경로가 준비됐다는 뜻이며 실제 외부 계정 승인·배포·수업 검증 성공을 대신하지 않습니다.

| 기능 | 코드 상태 | 검사 경로 |
|---|---|---|
| GitHub 알림 전달 독립 감시·중복 없는 재시도 | 구현 | [tests/delivery-monitor.test.ts](../tests/delivery-monitor.test.ts) · [tests/delivery-database.test.ts](../tests/delivery-database.test.ts) · [tests/backup-monitor-result.test.ts](../tests/backup-monitor-result.test.ts) |
| 기존 학습 화면 30건 페이지·10,000건 이후 이력 조회 | 구현 | [tests/workspace-page-database.test.ts](../tests/workspace-page-database.test.ts) · [tests/metadata-pages.test.ts](../tests/metadata-pages.test.ts) |
| 백업 전용 인증·자동 키 교체·예약 복원 검사와 복구 훈련 | 구현 | [tests/recovery-readiness-database.test.ts](../tests/recovery-readiness-database.test.ts) · [scripts/ci-recovery-drill.ts](../scripts/ci-recovery-drill.ts) · [tests/backup-machine-database.test.ts](../tests/backup-machine-database.test.ts) · [tests/backup-machine.test.ts](../tests/backup-machine.test.ts) |
| 선택한 개인 기기의 암호화 초안·충돌 방지·로그아웃 잠금 | 구현 | [tests/personal-draft-vault.test.ts](../tests/personal-draft-vault.test.ts) |
| 교사 주간 독서·제출·피드백 요약과 현재 확인 대기 | 구현 | [tests/weekly-summary.test.ts](../tests/weekly-summary.test.ts) · [tests/workspace-page-database.test.ts](../tests/workspace-page-database.test.ts) |
| 구현 현황 문서 동기화·배포와 운영 준비 보고 | 구현 | [tests/operations-report.test.ts](../tests/operations-report.test.ts) |

## 사용자 준비·별도 검증

| 항목 | 상태 | 완료 기준 |
|---|---|---|
| 독립 외부 보관처 실제 연결 | user-setup-required | 같은 PC 폴더와 같은 Supabase 제공자 사본을 독립 외부 보관으로 판정하지 않음 |
| 대체 운영자의 이메일 확인·MFA·본인 수락 | person-action-required | 본인 인증·수락은 자동 수행하지 않음 |
| 국내 도서 API 키 등록·실제 응답 확인 | credential-required | 연결 코드와 비공개 입력 도구는 준비됨 |
| 별도 실제 운영 환경 복구·전환 확인 | separate-target-required | 격리 CI 복원 통과와 실물 기기·운영 서버 전환을 구분함 |

최신 실행 결과는 배포 커밋의 GitHub Actions와 `/status`를 기준으로 확인합니다. `node scripts/operations-report.mjs`는 현재 공개 운영 상태를 별도 JSON으로 생성합니다. 코드 문서에 현재 연결 성공을 고정하지 않습니다.
