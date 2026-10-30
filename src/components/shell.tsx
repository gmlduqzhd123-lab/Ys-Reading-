"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  House,
  Compass,
  Sprout,
  Trophy,
  GraduationCap,
  ArrowUpRight,
  Menu,
  X,
  Leaf,
  Sparkles,
} from "lucide-react";

const links = [
  { href: "/", label: "오늘의 책숲", icon: House },
  { href: "/missions", label: "독서미션", icon: Compass },
  { href: "/app?view=forest", label: "나의 책숲", icon: Sprout },
  { href: "/app?view=contests", label: "글쓰기 축제", icon: Trophy },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <aside
        id="primary-navigation"
        className={`sidebar ${open ? "is-open" : ""}`}
        aria-label="주 메뉴"
      >
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            <BookOpen size={27} strokeWidth={1.9} />
            <Leaf size={11} />
          </span>
          <strong>
            책숲<span>BOOKFOREST</span>
          </strong>
        </Link>
        <button
          className="icon-button mobile-close"
          aria-label="메뉴 닫기"
          onClick={() => setOpen(false)}
        >
          <X size={22} />
        </button>
        <div className="sidebar-caption">나의 작은 인문 여행</div>
        <nav>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${(href === "/" ? pathname === "/" : href === "/missions" ? pathname.startsWith("/missions") : false) ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <Icon size={20} />
              <span>{label}</span>
              {href === "/missions" && <span className="nav-count">18</span>}
            </Link>
          ))}
        </nav>
        <div className="nav-divider" />
        <Link
          href="/studio"
          className={`nav-link ${pathname === "/studio" ? "active" : ""}`}
          onClick={() => setOpen(false)}
        >
          <Sparkles size={20} />
          책숲 놀이터
        </Link>
        <Link href="/app" className="nav-link" onClick={() => setOpen(false)}>
          <GraduationCap size={20} />
          우리 교실
        </Link>
        <Link
          href="/guide"
          className={`nav-link ${pathname === "/guide" ? "active" : ""}`}
          onClick={() => setOpen(false)}
        >
          <BookOpen size={20} />
          책숲 사용 안내
        </Link>
        <div className="sidebar-bottom">
          <div className="teacher-note">
            <span className="small-tag">FOR TEACHERS</span>
            <strong>생각이 자라는 교실</strong>
            <p>
              읽기부터 고쳐 쓰기까지,
              <br />
              우리 반의 여정을 함께해요.
            </p>
            <Link href="/guide">
              선생님을 위한 안내 <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="sidebar-footer">
            <span className="green-dot" />
            읽는 즐거움, 쓰는 용기
          </div>
        </div>
      </aside>
      {open && (
        <button
          className="sidebar-overlay"
          aria-label="메뉴 닫기"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="메뉴 열기"
              aria-expanded={open}
              aria-controls="primary-navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={24} />
            </button>
            <span className="topbar-breadcrumb">
              책숲 <span>/</span>{" "}
              {pathname === "/studio"
                ? "책숲 놀이터"
                : pathname.startsWith("/missions")
                  ? "독서미션"
                  : pathname.startsWith("/app")
                    ? "우리 교실"
                    : pathname === "/login"
                      ? "로그인"
                      : pathname === "/guide"
                        ? "사용 안내"
                        : "둘러보기"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="quiet-label">
              <Sprout size={15} /> 한 문장부터 시작해요
            </span>
            <Link className="button button-small button-outline" href="/app">
              내 교실 입장 <ArrowUpRight size={15} />
            </Link>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {children}
        </main>
        <footer className="page-footer">
          <span>© 책숲 · 읽고, 생각하고, 함께 자라요.</span>
          <Link href="/guide#privacy">개인정보와 작품 공개 안내</Link>
        </footer>
      </div>
    </div>
  );
}
