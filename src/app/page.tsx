import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Leaf, PenLine } from "lucide-react";
import { PaperBook } from "@/components/paper-book";
import { MissionCatalog } from "@/components/mission-catalog";

const journeys = [
  { title: "용기의 문장", description: "작은 용기에서 시작하는 이야기", author: "나의 생각을 글로", href: "/missions/courage-34-writing" },
  { title: "마음을 읽는 시간", description: "다른 마음을 만나 넓어지는 생각", author: "이야기 속 마음 찾기", href: "/missions/empathy-34-question" },
  { title: "함께 만드는 약속", description: "모두를 위한 더 나은 선택", author: "공정함을 생각하며", href: "/missions/fairness-34-writing" },
];
export default function Home() {
  return <div className="paper-home">
    <div className="paper-breadcrumb"><Link href="/">책숲</Link><span>/</span>오늘의 이야기</div>
    <section className="paper-home-grid">
      <div className="paper-home-main">
        <div className="paper-home-intro">
          <span className="eyebrow">A LITTLE PAGE, A GROWING WORLD</span>
          <h1>읽은 만큼,<br className="paper-mobile-break" /> 자라는 나.</h1>
          <p>오늘의 한 문장을 책숲에 남겨 보세요.<br />작은 기록이 모여, 나만의 이야기가 됩니다.</p>
          <div className="button-row">
            <Link href="/hub" className="button button-primary"><PenLine size={16} />나의 책장 열기</Link>
            <Link href="/app" className="paper-text-link">우리 교실로 <ArrowRight size={16} /></Link>
          </div>
        </div>
        <section className="paper-story-shelf" aria-labelledby="story-shelf-title">
          <div className="paper-section-heading"><h2 id="story-shelf-title">생각을 펼치는 책장</h2><span>용기 · 공감 · 공정</span></div>
          <div className="paper-book-grid">
            {journeys.map((j, i) => <Link href={j.href} key={j.title} className="paper-book-link">
              <PaperBook title={j.title} author={j.author} tone={i} />
              <h3>{j.title}</h3><p>{j.description}</p><span className="paper-cover-link">독서미션 살펴보기 <ArrowUpRight size={13} /></span>
            </Link>)}
          </div>
        </section>
        <section className="paper-writing-callout">
          <div><span className="eyebrow">FROM A SENTENCE TO A STORY</span><h2>한 문장에 담긴, 나만의 세상</h2><p>읽고, 생각하고, 고쳐 쓰며 나의 목소리를 찾아가요.</p></div>
          <Link href="/app?view=contests" className="paper-text-link">우리 반 글 나눔 <ArrowRight size={16} /></Link>
        </section>
      </div>
      <aside className="paper-growth paper-home-aside" aria-label="책숲과 함께하는 독서">
        <h2>천천히, 함께 자라요.</h2>
        <p className="paper-aside-intro">책 한 권에서 시작한 작은 질문이<br />나를 조금 더 넓은 세상으로.</p>
        <div className="paper-companion"><Image src="/images/paper-rabbit.png" width={280} height={280} sizes="(max-width: 760px) 180px, 260px" alt="자주색 책을 읽는 토끼" preload /><h3>생각이 머무는 작은 숲</h3><p>서두르지 않아도 괜찮아요.<br />오늘은 어떤 이야기를 만나 볼까요?</p></div>
        <div className="paper-aside-links">
          <Link href="/missions"><Leaf size={17} />나에게 맞는 독서미션 <ArrowUpRight size={14} /></Link>
          <Link href="/hub?tab=growth"><Leaf size={17} />나의 캐릭터·배지 <ArrowUpRight size={14} /></Link>
        </div>
        <div className="paper-small-note"><span>FOR OUR CLASSROOM</span><p>함께 읽고 나누는 교실을 준비하시나요?</p><Link href="/guide">선생님을 위한 사용 안내 <ArrowUpRight size={13} /></Link></div>
      </aside>
    </section>
    <MissionCatalog preview />
    <section className="paper-playground-note"><div><span className="eyebrow">A PLACE TO TRY</span><h2>생각을 가볍게, 책숲 놀이터</h2><p>모험 지도부터 나만의 작품집까지. 로그인 없이 연습해 보세요.</p></div><Link href="/studio" className="button button-outline">놀이터 둘러보기 <ArrowUpRight size={15} /></Link></section>
  </div>;
}
