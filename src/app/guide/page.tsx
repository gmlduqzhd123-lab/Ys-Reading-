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
            <li>완성한 글은 원할 때 축제에 출품해요.</li>
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
            <li>운영자가 등록한 학생을 학급에 연결해요.</li>
            <li>검토한 미션을 선택해 학급에 배정해요.</li>
            <li>제출 버전에 피드백과 수정 요청을 남겨요.</li>
            <li>완료된 작품으로 학급 글쓰기 축제를 열어요.</li>
          </ol>
          <p className="form-help">
            현재 개발 단계에서는 학생 계정과 동의 확인을 운영자가 관리합니다.
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
      <section className="panel privacy-panel" id="privacy">
        <ShieldCheck className="accent-icon" size={30} />
        <h2>내 글과 개인정보는 소중하니까요.</h2>
        <p>
          학습용 글과 피드백은 학생 본인과 담당 선생님만 확인하도록
          설계했습니다. 대회 심사용 작품은 학습용 글과 별도로 보관하며, 접수한
          뒤 학습 글을 수정해도 심사본은 바뀌지 않아요.
        </p>
        <p>
          지금은 개발 버전입니다. 보호자 확인 방식과 보관·삭제 정책을 확정하기
          전에는 실제 학생의 개인정보를 입력하지 마세요. 개발 검증에는 가상
          계정과 직접 만든 시험용 글을 사용합니다.
        </p>
        <p>
          공개 작품관과 학생 간 자유 채팅은 제공하지 않습니다. 계정·동의·자료
          삭제 요청은 담당 운영자를 통해 처리합니다.
        </p>
      </section>
    </div>
  );
}
