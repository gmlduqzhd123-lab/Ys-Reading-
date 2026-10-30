"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Leaf, Menu, UserRound, X } from "lucide-react";

const links = [
  { href: "/hub", label: "나의 책장", active: "reading" },
  { href: "/missions", label: "독서미션", active: "missions" },
  { href: "/app?view=contests", label: "글쓰기 활동", active: "contests" },
  { href: "/hub?tab=plaza", label: "학급 광장", active: "plaza" },
  { href: "/hub?tab=economy", label: "경제 교실", active: "economy" },
];
const moreLinks = [
  ["/app", "우리 교실"], ["/hub?tab=growth", "캐릭터·배지"],
  ["/hub?tab=exports", "기록·글 내보내기"], ["/hub?tab=manage", "학급 연결·관리"],
  ["/studio", "책숲 놀이터"], ["/guide", "책숲 사용 안내"],
];
function Navigation({ close }: { close: () => void }) {
  const path = usePathname();
  const query = useSearchParams();
  const current = path === "/hub" ? (query.get("tab") ?? "reading")
    : path.startsWith("/missions") ? "missions"
      : path === "/app" && query.get("view") === "contests" ? "contests" : "";
  return <>{links.map((l) => <Link key={l.href} href={l.href} onClick={close}
    className={current === l.active ? "selected" : ""}
    aria-current={current === l.active ? "page" : undefined}>{l.label}</Link>)}</>;
}
export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const more = useRef<HTMLDetailsElement>(null);
  const close = () => { setOpen(false); if (more.current) more.current.open = false; };
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return (
    <div className="site-shell paper-shell">
      <a className="skip-link" href="#main-content">본문으로 바로가기</a>
      <header className="paper-header">
        <Link href="/" className="paper-brand" onClick={close} aria-label="책숲 BOOKFOREST · 홈">
          <Leaf size={26} strokeWidth={1.2} /><strong>책숲</strong><span>BOOKFOREST</span>
        </Link>
        <nav id="primary-navigation" className={`paper-navigation ${open ? "is-open" : ""}`} aria-label="주 메뉴">
          <Suspense fallback={links.map((l) => <Link key={l.href} href={l.href} onClick={close}>{l.label}</Link>)}>
            <Navigation close={close} />
          </Suspense>
          <details className="paper-more" ref={more}>
            <summary>더보기 <ChevronDown size={13} /></summary>
            <div>{moreLinks.map(([href, label]) => <Link key={href} href={href} onClick={close}>{label}</Link>)}</div>
          </details>
          <Link className="paper-mobile-account" href="/account" onClick={close}>계정·참여 관리</Link>
        </nav>
        <div className="paper-header-actions">
          <Link className="paper-account" href="/account" onClick={close} aria-label="나의 계정"><UserRound size={17} strokeWidth={1.4} /><span>나의 계정</span></Link>
          <button ref={toggle} className="paper-menu-button" aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}>
            {open ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </header>
      <div className="main-column">
        <main id="main-content" className="main-content">{children}</main>
        <footer className="page-footer">
          <Link href="/" className="paper-footer-brand">책숲 <span>읽고, 생각하고, 함께 자라요.</span></Link>
          <div><Link href="/guide">사용 안내 <ArrowUpRight size={12} /></Link><Link href="/guide#privacy">개인정보와 작품 공개 안내</Link></div>
        </footer>
      </div>
    </div>
  );
}
