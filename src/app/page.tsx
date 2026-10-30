import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  MessageCircle,
  PencilLine,
  Sparkles,
  Trophy,
  Sprout,
} from "lucide-react";
import { ForestScene } from "@/components/forest-scene";
import { MissionCatalog } from "@/components/mission-catalog";

export default function Home() {
  return (
    <>
      <div className="welcome-line">
        <span>
          <span className="green-dot" /> 반가워요, 책숲 탐험가!
        </span>
        <span>읽는 만큼, 생각하는 만큼 자라요.</span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <Sprout size={15} /> 생각이 자라는 작은 숲
          </span>
          <h1>
            오늘도, 책 속으로
            <br />
            <span>한 걸음.</span>
          </h1>
          <p>
            책 한 권에서 시작한 작은 질문이
            <br />
            나만의 멋진 이야기가 되는 곳.
          </p>
          <Link href="/missions" className="button button-primary">
            독서미션 만나기 <ArrowRight size={17} />
          </Link>
          <div className="hero-footnote">
            <span className="mini-dot" /> 나의 속도로 읽고, 나의 생각으로 써요.
          </div>
        </div>
        <ForestScene />
        <div className="hero-caption">EVERY STORY STARTS WITH YOU.</div>
      </section>
      <section className="studio-home-callout">
        <span className="journey-icon step-3">
          <Sparkles size={25} />
        </span>
        <div>
          <span className="eyebrow">열 가지 생각 도구</span>
          <h2>책숲 놀이터가 열렸어요</h2>
          <p>모험 지도부터 나만의 작품집까지, 로그인 없이 체험해 보세요.</p>
        </div>
        <Link href="/studio" className="button button-primary">
          책숲 놀이터 입장 <ArrowRight size={17} />
        </Link>
      </section>
      <section className="journey-strip" aria-label="책숲 활동 순서">
        {[
          { icon: BookOpen, name: "책을 읽고", text: "궁금한 세상을 만나요" },
          {
            icon: MessageCircle,
            name: "질문하고",
            text: "내 생각의 씨앗을 찾아요",
          },
          {
            icon: PencilLine,
            name: "글로 쓰고",
            text: "나만의 목소리를 담아요",
          },
          {
            icon: Sparkles,
            name: "함께 자라요",
            text: "고쳐 쓰며 한 뼘 더 성장해요",
          },
        ].map(({ icon: Icon, name, text }, i) => (
          <div key={name} className="journey-step">
            <span className={`journey-icon step-${i}`}>
              <Icon size={21} strokeWidth={1.6} />
            </span>
            <div>
              <strong>{name}</strong>
              <span>{text}</span>
            </div>
            {i < 3 && <ArrowRight className="journey-chevron" size={16} />}
          </div>
        ))}
      </section>
      <MissionCatalog preview />
      <section className="bottom-promos">
        <div className="festival-promo">
          <div className="promo-icon">
            <Trophy size={31} strokeWidth={1.4} />
          </div>
          <div>
            <span className="small-tag">OUR WRITING FESTIVAL</span>
            <h2>내 이야기가 작품이 되는 순간</h2>
            <p>고쳐 쓴 글로 우리 반 글쓰기 축제에 도전해요.</p>
            <Link href="/app?view=contests" className="text-link">
              우리 반 축제 보기 <ArrowRight size={16} />
            </Link>
          </div>
          <span className="promo-star star-one">✦</span>
          <span className="promo-star star-two">✧</span>
        </div>
        <div className="quote-card">
          <span className="eyebrow">오늘의 생각 씨앗</span>
          <span className="quote-mark">“</span>
          <blockquote>
            이야기 속 주인공에게
            <br />딱 한 가지 물어본다면?
          </blockquote>
          <Link href="/missions">
            질문을 찾으러 가기 <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </>
  );
}
