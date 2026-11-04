# 책숲 공개 배포 절차

Vercel reading 프로젝트의 Production Deployment Checks에 GitHub의 `check`, `isolated-classroom`을 등록했습니다. 빌드 완료만으로 공개하지 않고 두 검사의 성공을 기다립니다. 자동 승격을 우회하지 않습니다.

1. 로컬 typecheck·테스트·빌드, 최근 암호화 백업·격리 복원을 확인합니다.
2. 기존 앱이 계속 작동하는 추가형 DB 변경과 계정 작업자를 먼저 반영합니다. 삭제·이름 변경은 이전 앱과의 호환 기간 후 별도 배포합니다.
3. 운영 DB·작업자의 release contract를 확인하고 GitHub의 정확한 커밋으로 배포합니다.
4. 필수 CI에서 실제 격리 Auth·DB·브라우저 흐름과 합성 데이터 복구·동시 요청을 검사합니다.
5. CI 성공 후 Vercel READY·alias 상태·배포 커밋 일치와 공개 서비스 상태를 각각 확인합니다.

문제 발생 시 직전 정상 배포 ID를 확인하여 Vercel의 Rollback으로 도메인을 되돌립니다. 앱 롤백은 DB나 이미 처리된 계정·보상·Google 파일을 되돌리지 않습니다. 호환 추가형 DB는 유지하고 수정 마이그레이션을 적용합니다. DB 데이터 복구는 별도 승인된 대상에서 검증한 후 진행합니다. 자동 destructive down migration을 사용하지 않습니다.
