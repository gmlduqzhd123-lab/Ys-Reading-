import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Leaf } from "lucide-react";
import type { HubData } from "@/lib/hub-data";
import { badgeLabels, characterLevel } from "@/lib/hub";
export function PaperGrowth({ data }: { data: HubData }) {
  const teacher = data.profile.role === "teacher";
  const level = characterLevel(data.totals.xp);
  const cls = data.classes[0];
  const currency = String(data.settings.find((s) => s.classroom_id === cls?.id)?.currency_name ?? "책잎");
  const species = data.character?.species ?? "rabbit";
  return <aside className="paper-growth" aria-label={teacher ? "교실 바로가기" : "나의 작은 성취"}>
    <h2>{teacher ? "우리 교실의 작은 변화" : "나의 작은 성취"}</h2>
    {teacher ? <p className="paper-aside-intro">읽은 책 한 권, 고쳐 쓴 한 문장.<br />함께 자라는 순간을 모아 보세요.</p>
      : <div className="paper-growth-stats">
        <div><strong>{level.xp}<small> XP</small></strong><span>차곡차곡 경험치</span></div>
        <div><strong>{level.level}</strong><span>나의 레벨</span></div>
        {cls && <div><strong>{data.totals.balances[cls.id] ?? 0}</strong><span>{currency}</span></div>}
      </div>}
    <div className="paper-companion">
      {teacher || species === "rabbit"
        ? <Image src="/images/paper-rabbit.png" width={260} height={260} sizes="(max-width: 760px) 180px, 230px" alt="책을 읽는 토끼" />
        : <span className="paper-species" role="img" aria-label={species === "fox" ? "여우" : "부엉이"}>{species === "fox" ? "🦊" : "🦉"}</span>}
      <h3>{teacher ? "생각이 머무는 교실" : (data.character?.nickname ?? "나의 책숲 친구")}</h3>
      <p>{teacher ? "작은 생각을 발견하고, 다음 문장을 응원해요." : `다음 레벨까지 ${level.next - level.xp} XP. 나의 속도로 자라요.`}</p>
      {!teacher && <progress value={level.xp} max={level.next} aria-label="다음 레벨까지의 성장" />}
      {!teacher && cls && <small className="paper-wallet-class">지갑 · {cls.name}</small>}
    </div>
    {teacher ? <div className="paper-aside-links">
      <Link href="/app?view=classes"><BookOpen size={17} />학급 만들기·미션 배정 <ArrowUpRight size={14} /></Link>
      <Link href="/operations"><Leaf size={17} />학생 계정·기록 관리 <ArrowUpRight size={14} /></Link>
    </div> : <>
      <div className="paper-earned-badges">{data.achievements.slice(0, 2).map((b) => <div key={b.id}><span><Leaf size={22} strokeWidth={1} /></span><strong>{badgeLabels[String(b.code)] ?? "나의 성취"}</strong></div>)}</div>
      {!data.achievements.length && <p className="paper-badge-note">활동을 하나씩 완성하면<br />이곳에 나만의 배지가 쌓여요.</p>}
      <Link className="paper-aside-link" href="/hub?tab=growth">캐릭터·배지 모두 보기 <ArrowUpRight size={14} /></Link>
    </>}
  </aside>;
}
