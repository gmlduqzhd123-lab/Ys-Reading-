import Link from "next/link";
import { BookOpen, GraduationCap, ShieldCheck, ArrowRight } from "lucide-react";
export const metadata = { title: "책숲 사용 안내" };
export default function GuidePage() {
  return (
    <div className="guide-page">
      <div className="page-intro">
        <span className="eyebrow">WELCOME TO BOOKFOREST</span>
        <h1>우리의 생각이 자라는 방법</h1>
        <p>책을 읽는 즐거움부터, 내 글을 다시 만나는 기쁨까지.</p>
      </div>
      <div className="guide-grid">
        <section className="panel">
          <BookOpen className="accent-icon" size={30} />
          <h2>학생이라면</h2>
          <ol className="guide-list">
            <li>선생님에게 받은 학생 아이디로 로그인해요.</li>
            <li>내 교실에서 배정된 독서미션을 골라요.</li>
            <li>책을 읽고 생각을 쓴 다음 제출해요.</li>
            <li>선생님의 피드백을 읽고 글을 다듬어요.</li>
            <li>
              저장 완료를 확인하고, 연결이 불안하면 임시보관·파일 저장을
              이용해요.
            </li>
            <li>완성한 글은 원할 때 우리 반·학년 글쓰기 활동에 참여해요.</li>
          </ol>
          <Link href="/login" className="text-link">
            내 교실 입장하기 <ArrowRight size={16} />
          </Link>
        </section>
        <section className="panel">
          <GraduationCap className="accent-icon" size={30} />
          <h2>선생님이라면</h2>
          <ol className="guide-list">
            <li>교사 계정으로 로그인하고 학급을 만들어요.</li>
            <li>
              ‘우리 반 시작하기’에서 학생 계정을 준비하고 필요한 참여 동의
              확인을 진행해요.
            </li>
            <li>검토한 미션을 선택해 학급에 배정해요.</li>
            <li>제출 버전에 피드백과 수정 요청을 남겨요.</li>
            <li>
              현황·알림에서 학생의 활동을 확인하고 기록 검색으로 지난 글을
              찾아요.
            </li>
            <li>완료된 작품으로 우리 반·학년 글쓰기 활동을 열어요.</li>
          </ol>
          <p className="form-help">
            담당 교사는 학생 계정을 발급하고, 운영자는 필요한 동의 근거와 교사
            권한을 확인합니다.
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>로그인 없이 책숲 놀이터</h2>
        <p>
          체험 교실, 모험 지도, 생각나무, 글쓰기 카드, 비교실, 인물 인터뷰,
          선택의 마을, 미션 제작실, 대회 준비 공방, 작품집을 이용할 수 있어요.
          학습 글과 보관 작품은 이 브라우저에 저장되며, 실제 학급에 전송되지
          않습니다.
        </p>
        <p>
          공용 기기에서는 작품을 내려받은 뒤 체험 기록을 초기화해 주세요. 다른
          기기로 자동 동기화되지는 않습니다.
        </p>
        <Link href="/studio" className="text-link">
          책숲 놀이터 열기 <ArrowRight size={16} />
        </Link>
      </section>
      <section className="panel">
        <h2>나의 책장 · 함께 자라는 교실</h2>
        <p>오늘 할 일의 ‘오늘 읽고, 한 줄 남기기’에서 읽던 책을 골라 간편하게 기록할 수 있어요. ‘수업 공방’에서는 교사가 만든 활동지를 온라인으로 배부하거나 인쇄하고, 학생은 활동·퀴즈·독서 리듬·도감을 이용합니다. 종이 제출은 교사가 관찰 기록으로 따로 확인합니다.</p><Link className="text-link" href="/classroom">우리 반 수업 공방 열기 →</Link>
        <ol className="guide-list">
          <li>
            나의 책장에서 제목·저자·ISBN으로 책을 검색하거나 직접 입력하고 독서
            기록을 남겨요.
          </li>
          <li>
            기록·글 내보내기에서 기록장, 제출한 글, 내 초안을 골라
            Word·CSV·인쇄·PDF로 간직해요.
          </li>
          <li>
            교사가 완독 기록과 미션을 확인하면 경험치·학급 화폐를 받아요. 캐릭터
            성장과 배지를 확인해요.
          </li>
          <li>
            학급 광장에 나눌 완료 작품과 공개 범위를 고르면 담당 교사의 확인 뒤
            게시돼요.
          </li>
          <li>
            경제 교실에서 학급별 잔액·거래 내역을 보고 상품을 구매 예약해요.
            교사가 취소하면 환불돼요.
          </li>
        </ol>
        <p>
          학년 활동은 대표 교사가 학급 연결을 승인한 모임 안에서 진행해요. 책숲
          활동 출석은 학교 출결과 별개이며, 한국 날짜 기준 학급별 하루 한 번
          인정됩니다.
        </p>
        <p>
          Google Docs·Sheets 저장은 Google 연결을 마친 교사가 이용합니다. 파일
          저장은 Google 계정 없이 사용할 수 있어요. 내보낸 사본은 이후 원본
          수정과 자동 동기화되지 않습니다.
        </p>
        <Link href="/hub" className="text-link">
          나의 책장 열기 <ArrowRight size={16} />
        </Link>
      </section>
      <section className="panel" id="operator-backup">
        <h2>운영자 백업과 복원 확인</h2>
        <p>
          운영자 PC의 프로젝트 폴더에서{" "}
          <code>node scripts/operator-backup.mjs</code>를 실행합니다. Codex의
          책숲 Supabase 연결 인증이 필요합니다. 백업은 현재 Windows 사용자와
          SYSTEM만 접근하는 문서 폴더의 Bookforest-OperatorBackups 폴더에
          암호화해 저장합니다.
        </p>
        <p>
          계정·권한·학습 기록·경제 원장과 마이그레이션을 함께 보관하고, 매번
          별도 PostgreSQL에 복원해 행 내용·외래키·접근 정책을 검사한 뒤 운영자
          상태 화면에 검증 결과를 기록합니다. 실패하거나 48시간 이상 지나면 상태
          화면에서 확인할 수 있습니다.
        </p>
        <p>
          암호화 키는 이 Windows 사용자 계정에 묶여 있습니다. PC나 Windows
          계정을 잃으면 이 백업만으로 복호화할 수 없으므로 기기 교체 전 운영자가
          ‘복구 키 내보내기’ 도구로 별도 암호를 설정한 키 파일을 다른 안전한
          장소에 보관해야 합니다. 현재 운영자 PC에는 매일 19시 백업과 매시간
          연결 점검을 구성했습니다. 연결 실패는 별도 경로로 보고하고 재시도하며,
          로그인·연결 회복 후 누락된 백업을 실행합니다. PC가 켜져 있고 해당 Windows
          사용자로 로그인한 상태여야 하며 Codex 연결 인증도 유효해야 합니다.
        </p>
        <p>
          복원 검사는 운영 자료를 덮어쓰지 않습니다. 실제 장애 복구는 격리된 새
          프로젝트에서 검증 후 전환해야 합니다. 기존 로그인 세션·일회용 인증
          링크, Google Drive 파일, 서비스 환경 변수와 외부 서비스 설정은 이
          백업에 포함하지 않습니다.
        </p>
        <p>
          학생 명단 CSV는 ‘아이디,별칭’으로 준비하고 오류를 먼저 수정하세요.
          발급 후 초기 비밀번호 안내표를 저장해야 합니다. 학기 진급은 페이지별로
          같은 다음 학급에 추가한 뒤 새 학급의 참여 근거를 확인하고 시작합니다.
        </p>
      </section>
      <section className="panel">
        <h2>학기 성장과 개인정보 운영</h2>
        <p>
          선생님은 학기 성장 보고서에서 기간·학생·대표 작품을 선택하고 원문과
          관찰 의견을 직접 확인해 저장합니다. 학생에게 공개할 판을 선택할 수
          있고 Word·인쇄/PDF·Google 문서·시트로 내보낼 수 있습니다.
        </p>
        <p>
          ‘나의 계정 → 사본·보관 정책 관리’에서 학교의 보관 근거를 확인하고 외부
          사본의 실제 보관·삭제 상태를 기록합니다. 원본을 삭제해도 이미
          내려받거나 Drive에 만든 파일이 자동 삭제되지는 않습니다.
        </p>
        <p>
          운영자의 동의 승인·권한 변경·삭제 등 중요 작업에는 본인의 인증앱으로
          최근 15분 이내 확인한 2단계 인증이 필요합니다.
        </p>
        <Link href="/reports" className="text-link">
          학기 성장 보고서 →
        </Link>
      </section>
      <section className="panel privacy-panel" id="privacy">
        <ShieldCheck className="accent-icon" size={30} />
        <h2>내 글과 개인정보는 소중하니까요.</h2>
        <p>
          학습용 글과 피드백은 학생 본인과 담당 선생님만 확인하도록
          설계했습니다. 학급·학년 활동의 검토용 작품은 학습용 글과 별도로
          보관하며, 접수한 뒤 학습 글을 수정해도 심사본은 바뀌지 않아요.
        </p>
        <p>
          지금은 개발 버전입니다. 보호자 확인 방식과 보관·삭제 정책을 확정하기
          전에는 실제 학생의 개인정보를 입력하지 마세요. 개발 검증에는 가상
          계정과 직접 만든 시험용 글을 사용합니다.
        </p>
        <p>
          광장은 학생의 공유 선택과 교사의 확인을 거친 사본을 허용한 학급·학년
          안에서 보여줍니다. 학년 접수본은 모임의 운영 교사가 검토할 수
          있습니다. 계정·동의·자료 삭제 요청은 담당 운영자를 통해 처리합니다.
        </p>
      </section>
    </div>
  );
}
