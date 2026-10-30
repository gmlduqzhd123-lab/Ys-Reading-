# 책숲 데이터와 권한 계약

이 문서는 v0.1 구현 계약이다. 초기 마이그레이션은 **기존 데이터가 없는 새 Supabase 프로젝트에만** 적용한다. 원격 프로젝트에는 사용자 선택이 확인된 뒤 적용하며, 현재 파일 작성과 PGlite 검증은 원격 데이터에 영향을 주지 않는다.

## 현재 범위

학급 담당 교사와 학생을 지원한다. 학급은 현재 격리 단위다. 기관 관리자·복수 담당 교사·외부 심사위원·보호자 대시보드·공개 작품 전시·파일 업로드는 아직 구현하지 않는다. 교사가 담당 학급의 대회를 심사하는 소규모 운영 구조다.

실제 학생은 동의 대기 상태로 등록한다. 보호자 관계 확인과 동의 증빙 수집은 아직 서비스 화면으로 구현되지 않았으므로 실제 아동 운영 전에 별도 절차와 기록 정책을 마련해야 한다. `verified`는 관리자가 증빙을 확인한 결과이며, 학생이나 교사가 클라이언트에서 임의로 설정할 수 없다. 개발용 가상 학생 데이터와 실제 학생의 확인 절차를 구별한다.

## 테이블

| 테이블 | 주요 의미 |
|---|---|
| profiles | Auth 사용자와 1:1 연결. 표시명, student/teacher 역할, pending/verified 동의 상태 |
| classrooms / enrollments | 담당 교사, 학급 소속과 활성 상태. enrollments의 기본키는 classroom_id + student_id이며 별도 id 없음 |
| missions / assignments | 원본 미션과 배정 시점의 전체 미션 스냅샷. 원본 수정은 기존 배정을 바꾸지 않음 |
| drafts | 학생별 배정 초안. revision은 1부터 시작. 담당 교사도 미제출 초안은 조회 불가 |
| submissions / feedback | 변경 불가능한 글 버전과 해당 버전에 대한 교사 피드백. 상태만 제한적으로 변경 |
| badges | 학생별 first_mission, first_revision, three_themes 배지. 학생·코드 조합당 한 개 |
| contests / entries / reviews | 학급 대회, 완료 글의 접수 스냅샷, 담당 교사의 항목별 심사 |
| audit_events | 중요 행위의 수행자·대상·학급·시각. 글 본문과 피드백 본문을 넣지 않음 |

모든 테이블에 `created_at`이 있다. 초안에는 `updated_at`도 있다. 필수 외래키와 접근에 사용하는 인덱스를 포함한다.

## 권한

- 노출된 모든 테이블에 RLS를 적용한다. `authenticated`는 허용된 행의 SELECT와 아래 RPC만 사용할 수 있다. 테이블 직접 INSERT/UPDATE/DELETE 권한은 없다.
- 학생은 본인 기록만 조회한다. 학급·배정·대회 조회와 신규 활동은 활성 소속 및 확인된 동의가 필요하다. 이용 중지 후에도 자신의 기존 글 조회는 허용하며 신규 쓰기는 차단한다.
- 교사는 담당 학급의 제출물·학생 정보·대회만 조회한다. 다른 학급과 학생 초안은 조회하지 못한다.
- 심사 결과는 교사에게 즉시, 해당 학생에게는 결과 공개 이후에만 보인다. 다른 학생 작품과 점수는 공개하지 않는다.
- `service_role`은 관리용으로만 쓴다. 클라이언트나 브라우저 환경 변수에 넣지 않는다. 서버의 일반 학생·교사 요청은 사용자 세션으로 처리한다.
- Auth 신규 계정 생성 트리거는 profile을 항상 `student/pending`으로 만든다. 사용자가 변경할 수 있는 metadata의 role/consent를 신뢰하지 않는다. 관리자 계정 준비 스크립트는 기존 profile을 UPDATE하거나 UPSERT해야 한다.
- 순환 RLS 방지를 위한 boolean helper는 API에 노출하지 않는 `private` 스키마에 둔다. helper의 실행 권한도 필요한 역할에만 부여한다.
- 공개 mutation RPC의 SECURITY DEFINER는 권한 우회용 임시 해결책이 아니라 불변 제출물·심사·배지를 일반 테이블 쓰기에서 분리하기 위한 설계다. 고정된 빈 search_path, 완전한 스키마 이름, 명시적 본인/학급 검사, PUBLIC 실행 권한 제거를 적용한다.

## RPC

각 RPC는 이름에 적힌 테이블의 **단일 composite row**를 반환한다. HTTP 클라이언트는 Supabase의 반환값을 해당 행으로 처리한다.

| RPC | 인수 | 반환 |
|---|---|---|
| create_classroom | p_name text | classrooms |
| assign_mission | p_classroom_id uuid, p_mission_id uuid, p_due_at timestamptz 또는 null | assignments |
| save_draft | p_assignment_id uuid, p_title text, p_body text, p_expected_revision int | drafts |
| submit_work | p_assignment_id uuid, p_title text, p_body text, p_request_id uuid | submissions |
| review_work | p_submission_id uuid, p_body text, p_decision text | submissions |
| create_contest | p_classroom_id uuid, p_title text, p_description text, p_opens_at timestamptz, p_closes_at timestamptz | contests |
| enter_contest | p_contest_id uuid, p_submission_id uuid, p_request_id uuid | entries |
| submit_review | p_entry_id uuid, p_scores jsonb, p_comment text | reviews |
| publish_contest | p_contest_id uuid | contests |

초안 첫 저장은 `p_expected_revision=0`이고 성공 후 `revision=1`이다. 다음 저장에는 마지막 확인 revision을 전달한다. 충돌은 오래된 내용을 덮어쓰지 않고 오류로 반환한다. 제출에는 마지막 자동저장 참조 대신 실제 제출할 제목·본문을 전달해 편집 중 내용이 누락되지 않도록 한다.

`submit_work`와 `enter_contest`는 학생+request_id를 고유하게 저장한다. 같은 요청의 재시도는 기존 결과를 반환하고, 같은 키로 다른 내용을 보내면 오류다. 같은 키로 접수 완료 사실을 확인하는 재시도는 마감이나 이용 중지 이후에도 가능하다. 이용 중지 후 새 쓰기는 허용하지 않는다. 요청 키는 네트워크 오류 뒤 재시도에도 유지해야 한다.

학습 미션은 목표일 이후에도 제출할 수 있다. 서버가 접수 시각을 정하고 `is_late=true`로 기록한다. 대회 접수 마감은 엄격하게 적용한다. 제목은 원문 100자, 본문은 원문 10,000자, 피드백·심사 의견은 원문 2,000자로 제한한다. 공백을 제외해 상한을 우회할 수 없다.

최신 제출본이 `revision_requested` 또는 `completed`일 때 새 버전을 제출할 수 있다. 최신본이 `submitted`이면 교사의 피드백까지 추가 제출을 기다린다. 변경되지 않은 제목·본문으로 재제출할 수 없다. `requires_revision=true` 배정은 앞선 수정 요청과 새 제출 버전이 있어야 완료된다. 제출은 `submitted → revision_requested 또는 completed`로만 전이한다. 과거 버전의 심사는 거절하고, 동일 피드백 재시도는 같은 결과를 반환한다. 완료 뒤 새 버전을 만들어도 기존 완료본과 배지는 유지하며 기존 완료본으로 대회에 참가할 수 있다. 첫 완료, 수정본 완료, 세 주제 완료 배지는 고유 제약으로 한 번만 지급한다.

대회 접수는 서버 시각 기준 `opens_at <= now < closes_at`, 상태 open일 때 가능하다. 같은 학급의 본인 완료 글만 참가할 수 있다. v0.1은 학생당 대회 접수 한 건이며 교체·취소 기능은 없다. 접수 결과에는 고유 receipt가 있다. 접수 스냅샷은 원본 글과 분리해 보존한다.

심사 점수 형식은 `{ "thought": 0..30, "evidence": 0..30, "structure": 0..25, "expression": 0..15 }`이며 네 항목 모두 정수다. 마감 후 첫 심사가 open을 reviewing으로 변경한다. 접수작이 하나 이상 있고 모든 작품의 심사가 끝나야 published로 바뀐다. 심사 수정·마감 연장·결과 재개는 v0.1에 없다. 결과의 공개 범위는 학급 전체가 아니라 본인 결과다.

## 오류 코드

메시지에 포함된 `BF_` 코드를 사용자용 한국어 안내로 바꾸며 SQL 원문·학생 본문을 화면이나 로그에 내보내지 않는다.

- 인증·권한: BF_UNAUTHENTICATED, BF_FORBIDDEN
- 입력: BF_INVALID_INPUT, BF_INVALID_DEADLINE, BF_NOT_FOUND, BF_INVALID_SCORES
- 저장·제출: BF_DRAFT_CONFLICT, BF_IDEMPOTENCY_CONFLICT, BF_REVISION_NOT_REQUESTED, BF_REVISION_UNCHANGED
- 피드백: BF_STALE_SUBMISSION, BF_ALREADY_REVIEWED, BF_REVISION_REQUIRED, BF_INVALID_TRANSITION
- 대회: BF_CONTEST_CLOSED, BF_CONTEST_NOT_OPEN, BF_ALREADY_ENTERED, BF_COMPLETED_WORK_REQUIRED, BF_CONTEST_STILL_OPEN, BF_RESULTS_PUBLISHED, BF_NO_ENTRIES, BF_REVIEWS_INCOMPLETE
- 불변 기록: BF_IMMUTABLE_SUBMISSION, BF_IMMUTABLE_SNAPSHOT

## 검증과 배포

`npx vitest run tests/database.test.ts`는 실제 PostgreSQL 엔진인 PGlite에 마이그레이션을 실행한다. Auth의 UID 함수와 역할만 시험용으로 구성하고, 테스트의 사용자 조회는 테이블 소유자가 아닌 authenticated 역할로 실행한다. 데이터 격리, metadata 위조, 동의, 초안 충돌, 멱등성, 불변 스냅샷, 수정 과정, 배지, 마감 후 접수 복구, 심사 점수와 공개 시점을 검증한다.

PGlite 검증은 원격 Supabase Auth, PostgREST, 네트워크 동시성, 실제 브라우저 세션의 종단 검증을 대체하지 않는다. 운영 배포 전 새 개발 프로젝트에서 사용자별 RPC 호출, 역할 권한, Auth 세션, 동시 제출, 보안 advisor를 확인해야 한다. 개발·미리보기와 운영은 서로 다른 Supabase 프로젝트와 환경 변수를 사용한다. 로컬 config의 회원가입은 비활성화되어 있으며 관리자를 통한 계정 준비를 전제로 한다. 원격 Auth 설정은 별도로 확인해야 한다.

원격 적용 전에는 마이그레이션 대상과 기존 데이터 부재를 확인한다. 적용 후 보안 advisor와 핵심 사용자 흐름을 검증한다. v0.1에서는 개인정보 삭제·보존 기한·동의 철회 증빙·기관 이동·법정 보존을 자동 처리하지 않으므로 실제 학생 운영 전에 운영 책임자와 정책 및 구현 범위를 확정해야 한다. 관리용 service_role을 이용한 삭제는 별도 검토·감사 절차의 대상이다.
