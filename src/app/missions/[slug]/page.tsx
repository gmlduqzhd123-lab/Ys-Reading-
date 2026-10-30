import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  BookOpen,
  Lightbulb,
  Check,
} from "lucide-react";
import { missions, themes } from "@/lib/missions";
export function generateStaticParams() {
  return missions.map((m) => ({ slug: m.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: missions.find((m) => m.slug === slug)?.title || "독서미션" };
}
export default async function MissionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mission = missions.find((m) => m.slug === slug);
  if (!mission) notFound();
  return (
    <div className="detail-page">
      <Link href="/missions" className="back-link">
        <ArrowLeft size={16} />
        독서미션으로 돌아가기
      </Link>
      <header className={`mission-detail-header theme-${mission.theme}`}>
        <span className="topic-tag">{themes[mission.theme].label} 탐험</span>
        <h1>{mission.title}</h1>
        <p>{mission.description}</p>
        <div className="mission-meta">
          <span>{mission.grade_band}학년</span>
          <span>
            <Clock3 size={15} /> 약 {mission.minutes}분
          </span>
          <span>
            <BookOpen size={15} /> 내가 고른 책
          </span>
        </div>
      </header>
      <div className="detail-columns">
        <section className="panel activity-panel">
          <span className="eyebrow">YOUR MISSION</span>
          <h2>오늘의 생각 질문</h2>
          <div className="prompt-box">
            <Lightbulb size={22} />
            <p>{mission.prompt}</p>
          </div>
          <h3>이렇게 해 봐요</h3>
          <ol className="activity-steps">
            {mission.steps.map((step, i) => (
              <li key={step}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </section>
        <aside className="panel start-panel">
          <BookOpen size={30} />
          <h2>준비됐나요?</h2>
          <p>
            읽고 싶은 책 한 권과
            <br />
            나만의 생각을 준비해요.
          </p>
          <ul>
            <li>
              <Check size={16} /> 정답이 하나일 필요 없어요.
            </li>
            <li>
              <Check size={16} /> 책 속 장면을 떠올려 봐요.
            </li>
            <li>
              <Check size={16} /> 내 말로 천천히 표현해요.
            </li>
          </ul>
          <Link href="/app" className="button button-primary">
            우리 교실에서 시작 <ArrowRight size={16} />
          </Link>
          <p className="form-help">
            선생님이 배정한 미션은
            <br />내 교실에서 작성하고 제출해요.
          </p>
        </aside>
      </div>
    </div>
  );
}
