"use client";
import { useState } from "react";
import { Leaf, Sparkles } from "lucide-react";
export function PaperBook({ title, author = "", thumbnail, tone = 0 }: {
  title: string; author?: string; thumbnail?: string; tone?: number;
}) {
  const [failed, setFailed] = useState(false);
  return <div className={`paper-book tone-${tone % 3}`} aria-hidden="true">
    {thumbnail && !failed ? <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : <><span className="paper-book-edition">BOOKFOREST · READING JOURNAL</span><strong>{title}</strong>
        <span className="paper-book-botanical" aria-hidden="true"><Leaf size={65} strokeWidth={0.65} /><Sparkles size={24} strokeWidth={0.8} /></span>
        <span className="paper-book-author">{author || "나의 독서 기록"}</span></>}
  </div>;
}
