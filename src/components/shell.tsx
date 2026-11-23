"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Leaf,
  Menu,
  UserRound,
  X,
} from "lucide-react";
import { ViewSettings } from "@/components/participation/view-settings";
import { ConnectionBanner } from "@/components/recovery/connection-banner";
import { ServiceAlert } from "@/components/recovery/service-alert";
import { createClient } from "@/lib/supabase/client";
import { newClassHref } from "@/lib/classroom-entry";

const publicLinks = [
  ["/hub?tab=today", "내 교실"],
  ["/missions", "독서미션"],
  ["/login?mode=teacher", "교사 로그인"],
] as const;
const teacherLinks = [
  ["/hub?tab=today", "오늘의 교실"],
  ["/hub?tab=review", "학생 기록 확인"],
  ["/hub?tab=manage", "학급 관리"],
] as const;
const studentLinks = [
  ["/hub?tab=today", "오늘 할 일"],
  ["/hub?tab=reading", "나의 책장"],
  ["/app?view=feedback", "받은 피드백"],
] as const;
const moreLinks = [
  [newClassHref, "학급 개설 (교사)"],
  ["/missions", "독서미션"],
  ["/app?view=contests", "글쓰기 활동"],
  ["/hub?tab=search", "기록 검색"],
  ["/hub?tab=plaza", "학급 광장"],
  ["/hub?tab=exhibitions", "작은 작품 전시회"],
  ["/hub?tab=growth", "캐릭터·배지"],
  ["/hub?tab=economy", "경제 교실"],
  ["/hub?tab=exports", "기록·글 내보내기"],
  ["/reports", "학기 성장 보고서"],
  ["/studio", "책숲 놀이터"],
  ["/status", "연결 점검·기록 보관"],
  ["/guide", "책숲 사용 안내"],
] as const;

type Role = "student" | "teacher" | null;

function useNavigationRole() {
  const path = usePathname();
  const cached = useRef<{ id: string; role: Role; at: number } | null>(null);
  const [role, setRole] = useState<Role>(null);
  useEffect(() => {
    let client;
    try { client = createClient(); } catch { return; }
    let request = 0;
    let timer: ReturnType<typeof setTimeout>;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id;
      const current = ++request;
      clearTimeout(timer);
      if (!id || cached.current?.id !== id) {
        cached.current = null;
        setRole(null);
      }
      if (!id) return;
      if (cached.current && Date.now() - cached.current.at < 60_000) return;
      // Read the account's own profile outside the Auth callback lock. This only
      // selects menu labels. Pages and actions still enforce their own access.
      timer = setTimeout(async () => {
        try {
          const { data } = await client.from("profiles")
            .select("role,account_active,must_change_password").eq("id", id).maybeSingle();
          if (current !== request) return;
          const next = data?.account_active && !data.must_change_password &&
            (data.role === "teacher" || data.role === "student") ? data.role : null;
          if (data) cached.current = { id, role: next, at: Date.now() };
          setRole(next);
        } catch {
          if (current === request) setRole(null);
        }
      }, 0);
    });
    return () => {
      request++;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [path]);
  return role;
}

type MenuLinks = readonly (readonly [string, string])[];
function Navigation({ close, links }: { close: () => void; links: MenuLinks }) {
  const path = usePathname();
  const query = useSearchParams();
  return (
    <>
      {links.map(([href, label]) => {
        const [linkPath, search] = href.split("?");
        const active = linkPath === path && [...new URLSearchParams(search)].every(
          ([key, value]) => (query.get(key) ?? (key === "tab" ? "today" : "")) === value,
        );
        return (
          <Link key={href} href={href} prefetch={false} onClick={close}
            className={active ? "selected" : ""}
            aria-current={active ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const role = useNavigationRole();
  const links = role === "teacher" ? teacherLinks : role === "student" ? studentLinks : publicLinks;
  const extraLinks = [
    ...(role === "teacher" ? [["/hub?tab=reading", "나의 책장"]] as const : []),
    ...moreLinks.filter(([href]) => (role !== "student" || href !== newClassHref) &&
      !links.some(([primary]) => primary === href)),
  ];
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const more = useRef<HTMLDetailsElement>(null);
  const close = () => {
    setOpen(false);
    if (more.current) more.current.open = false;
  };
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return (
    <div className="site-shell paper-shell">
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <header className="paper-header">
        <Link
          href="/"
          className="paper-brand"
          onClick={close}
          aria-label="책숲 BOOKFOREST · 홈"
        >
          <Leaf size={26} strokeWidth={1.2} />
          <strong>책숲</strong>
          <span>BOOKFOREST</span>
        </Link>
        <nav
          id="primary-navigation"
          className={`paper-navigation ${open ? "is-open" : ""}`}
          aria-label="주 메뉴"
        >
          <Suspense
            fallback={links.map(([href, label]) => (
              <Link key={href} href={href} prefetch={false} onClick={close}>
                {label}
              </Link>
            ))}
          >
            <Navigation close={close} links={links} />
          </Suspense>
          <details className="paper-more" ref={more}>
            <summary>
              더보기 <ChevronDown size={13} />
            </summary>
            <div>
              {extraLinks.map(([href, label]) => (
                <Link key={href} href={href} prefetch={false} onClick={close}>
                  {label}
                </Link>
              ))}
            </div>
          </details>
          <Link
            className="paper-mobile-account"
            href="/account"
            onClick={close}
          >
            계정·참여 관리
          </Link>
        </nav>
        <div className="paper-header-actions">
          <ViewSettings />
          {/* 엽쌤의 다른 앱과 같은 상단 버튼: public/ys-install.js, public/ys-qr.js 가 연결합니다 */}
          <button type="button" className="ys-chip" data-ys-install="">
            📲 <span className="ys-wide">앱 </span>설치
          </button>
          <button
            type="button"
            className="ys-chip"
            data-qr=""
            aria-label="QR 코드로 접속"
          >
            📱 QR
          </button>
          <Link
            className="paper-account"
            href="/account"
            onClick={close}
            aria-label="나의 계정"
          >
            <UserRound size={17} strokeWidth={1.4} />
            <span>나의 계정</span>
          </Link>
          <button
            ref={toggle}
            className="paper-menu-button"
            aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={open}
            aria-controls="primary-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </header>
      <div className="main-column">
        <ConnectionBanner />
        <ServiceAlert />
        <main id="main-content" className="main-content">
          {children}
        </main>
        <footer className="page-footer">
          <Link href="/" className="paper-footer-brand">
            책숲 <span>읽고, 생각하고, 함께 자라요.</span>
          </Link>
          <div>
            <Link href="/guide">
              사용 안내 <ArrowUpRight size={12} />
            </Link>
            <Link href="/privacy">개인정보와 작품 공개 안내</Link>
          </div>
          <p className="ys-credit">
            © 2026 엽쌤. All rights reserved. ·{" "}
            <a href="https://gmlduqzhd123-lab.github.io/YScode/">
              엽쌤의 다른 앱 보기 →
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
