# 백업용 MCP 연결 복구

2026-11-08 점검에서 Windows 예약 백업의 Supabase MCP OAuth 토큰 갱신 실패를 확인했습니다. 웹·DB·로그인 점검은 통과했지만 새 전체 백업이 만들어지지 않아, 마지막 검증 후 48시간이 지나 `BACKUP_STALE`로 GitHub 점검이 반복 실패했습니다.

백업 도구는 공급자의 원문 오류나 인증 정보를 출력하지 않습니다. OAuth 토큰 갱신·만료·로그인 실패는 `MCP_AUTH_REQUIRED`, 일반 RPC 실패는 `MCP_REQUEST_FAILED`, MCP 도구가 반환한 실패는 `MCP_TOOL_FAILED`로 구분합니다. 초기 연결 실패도 실제 오류 분류를 유지합니다. 오류 응답이나 결과가 누락된 응답을 성공한 SQL 실행으로 간주하지 않습니다.

## 복구 순서

1. 예약 작업과 같은 Windows 사용자로 Codex의 기존 `supabase` 연결을 확인합니다. 대상은 `rbtqtkjnqtcnljvabisa` 프로젝트입니다. 서버 설정·기능·권한을 넓히지 않고 기존 OAuth 인증을 갱신합니다. CLI를 사용한다면 `codex mcp login supabase`를 실행한 터미널을 인증 완료까지 열어 두며, 로그인·콜백은 같은 PC에서 완료합니다. 비밀번호·인증 코드·토큰은 채팅이나 로그에 넣지 않습니다.
2. Windows 예약 작업 `\Bookforest\Bookforest-Operator-Backup`을 실행합니다. 예약 작업이 사용한 Codex 실행 파일에서 실제 프로젝트 URL 확인이 성공해야 합니다. 프로젝트 확인이 실패하면 원격 백업 상태 기록도 쓰지 않고 실패 내역을 운영자 전용 로컬 폴더에 보관합니다.
3. 예약 작업의 종료 코드 `0`, `scheduled-status.json`의 `verified: true`, 새 `.bfbak.verification.json`을 확인합니다. 백업 도구는 암호문을 다시 읽어 별도 PGlite에서 데이터·외래키·접근 정책·최신 개인정보 상태를 복원 검증합니다. 운영 DB를 과거 데이터로 덮어쓰지 않습니다.
4. `/api/backup-health`가 새 검증 시각과 `healthy: true`, `code: OK`를 반환하는지 확인한 뒤 GitHub `Bookforest availability`를 재실행합니다. 서비스와 백업 검사가 모두 통과하고 기존 백업 알림 이슈가 자동 종료돼야 복구 완료입니다.
5. 기존 암호화 복구 폴더를 최신 백업과 `privacy-current.bfguard`로 갱신합니다. 복구 암호·키를 유지하며, 외부 장치 복사와 다른 실물 PC의 복구는 별도로 확인합니다.

원격 DB와 통신할 수 없었던 실패 내역은 로컬에 남으며 연결이 복구된 다음 백업에서 원격 상태 기록에 반영합니다. 인증 갱신 실패를 백그라운드에서 자동 승인하거나 알림 판정 기준을 완화하지 않습니다.
