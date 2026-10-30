# 페이퍼 갤러리 · 디자인 적용

선택한 3안의 아이보리·차콜·차분한 자주색, 명조 제목, 상단 가로 메뉴, 표지 갤러리와 성장 영역을 적용했다. 사용자 데이터와 권한 검사는 기존 Supabase 흐름을 사용한다. 화면에 허구의 독서량·화폐·배지를 채우지 않는다.

- `src/app/paper-gallery.css`: 공통 색·서체·여백과 반응형 규칙. 900px 이하 펼침 메뉴, 600px 이하 2열 책장·단일 열 화면.
- `next/font/google`의 Noto Serif KR은 빌드 때 받아 같은 도메인에서 제공한다. 본문과 입력은 시스템 고딕체를 사용한다.
- `PaperBook`: 실제 검색 표지 또는 제목·저자로 만든 대체 표지. 표지 로딩이 실패하면 대체 표지로 전환한다. 홈의 세 가지 표지는 미션 주제를 소개하는 그래픽이며 학생 기록이 아니다.
- 학생의 책장·글 미리보기·경험치·레벨·첫 학급 지갑·배지는 인증된 데이터에서 표시한다. 교사는 학급 운영 바로가기를 표시한다. 토끼 외에 선택해 둔 여우·부엉이 캐릭터도 유지한다.
- 기록 작성은 펼침 영역으로 정리하되 초안 충돌·저장·교사 확인·미저장 이동 경고를 유지한다. 제출된 글은 기존 글쓰기 화면에서 확인한다.

## 검증 · 2026-10-31

로컬 Production 빌드와 실제 원격 Supabase의 가상 계정으로 독서 기록 저장·수정, 미저장 이동 취소 후 입력 유지, 책장 갤러리·본인 최신 글 미리보기, 캐릭터 선택·XP·지갑·배지, 품절 표시, 글쓰기·피드백 화면을 확인했다. 390px·820px·기본 데스크톱 크기에서 가로 넘침, 모바일 메뉴와 Escape 닫기, 쿼리별 현재 메뉴 표시를 검사했다. 학교 실물 기기 검증을 뜻하지 않는다.

검수 중 글쓰기 화면이 최신 제출본보다 오래된 초안을 우선 표시하는 경우를 발견해, 제출본 이후 수정된 초안만 우선 복구하도록 고쳤다. 기존 초안 revision을 유지해 다음 저장의 충돌 검사는 계속 적용한다. 구형 초안·새 수정본·동일 시각·빈 시작 상태를 회귀 검사했다.

가상 학생은 제품의 승인된 삭제 절차로 정리했다. 남은 가상 교사와 학급은 정확한 테스트 표식·UUID·소유권을 검사해 제거했다. 최종 원격 집계는 실제 사용자 1명·운영자 1명, 학급·독서 기록·제출 글·경제 원장 0건이다. 비밀번호와 세션은 저장소에 포함하지 않는다. DB 스키마·권한·Google 설정은 이번 디자인 작업에서 변경하지 않았다.

`npm run check`: 타입 검사, 19개 파일의 236개 테스트, Production 빌드 통과.

## 삽화 출처

`public/images/paper-rabbit.png`는 내장 image_gen 도구로 새로 만든 투명 배경 삽화다. 원본은 1254×1254, alpha 포함이며 Next Image로 최적화해서 표시한다. 기존 사용자 사진·책 표지를 변형하지 않았다.

제작 프롬프트:

```text
A single exquisite small watercolor and colored-pencil storybook illustration for a sophisticated Korean reading journal website. A gentle ivory white rabbit sits in three-quarter view reading a small muted dusty-plum hardcover book. Long delicate ears, soft natural proportions, warm tender expression, subtle paper-grain brushwork, restrained premium illustrated stationery style. Only two small botanical stems of olive-sage leaves and one tiny muted lavender flower cluster near the rabbit's feet; sparse composition. Rabbit centered in a portrait-friendly square with ample transparent margins. Warm charcoal fine pencil details, ivory fur with taupe shading, subdued sage and dusty plum palette. No text, no logos, no labels, no UI, no frame, no badge, no circles, no furniture, no background scene, no large ground shadow. Isolated cutout with genuinely transparent background. High resolution, polished authentic watercolor craft, warm and literary, tasteful rather than loud or glossy.
```
