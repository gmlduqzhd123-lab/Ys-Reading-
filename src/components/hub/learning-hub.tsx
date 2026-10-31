"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Bookshelf } from "./bookshelf";
import { Character, Economy } from "./growth-economy";
import { Management, Plaza } from "./community";
import { Exports } from "./exports";
import { PaperGrowth } from "./paper-growth";
import { ArrowRight, PenLine } from "lucide-react";
import type { HubData } from "@/lib/hub-data";
import { readingScrollBehavior } from "@/lib/hub";
import type { DashboardData } from "@/lib/data";
import type { ParticipationData } from "@/lib/participation";
import { Today } from "@/components/participation/today";
import { ReviewQueue } from "@/components/participation/review-queue";
import { SharedForest } from "@/components/participation/shared-forest";
import { EconomyLab } from "@/components/participation/economy-lab";
import { Exhibitions } from "@/components/participation/exhibitions";
import { LessonPacks } from "@/components/participation/lesson-packs";
import { RefreshButton } from "@/components/participation/refresh-button";
export function LearningHub({
  data,
  initialTab,
  google,
  googleNotice,
  participation,
  dashboard,
}: {
  data: HubData;
  initialTab?: string;
  google: { configured: boolean; connected: boolean };
  googleNotice?: string;
  participation?: ParticipationData | null;
  dashboard?: DashboardData | null;
}) {
  const teacher = data.profile.role === "teacher";
  const tabs = [
    ["today", teacher?"오늘의 교실":"오늘 할 일"],
    ...(teacher?[["review","학생 기록 확인"],["packs","수업 꾸러미"]]:[]),
    ["reading", "나의 책장"],
    ["exports", "기록·글 내보내기"],
    ["growth", "캐릭터·배지"],
    ["plaza", "학급 광장"],
    ["exhibitions", "작은 작품 전시회"],
    ["economy", "경제 교실"],
    ["manage", teacher ? "학급·학년 관리" : "학급 연결"],
  ];
  const tab = tabs.some(([id]) => id === initialTab) ? initialTab! : "today";
  useEffect(() => {
    const guard = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = e.target instanceof Element ? e.target.closest("a") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (
        document.querySelector('form[data-hub-dirty="true"]') &&
        !window.confirm(
          "아직 저장하지 않은 입력이 있어요. 입력을 남겨두려면 취소하고 먼저 저장해 주세요. 이동할까요?",
        )
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, []);
  return (
    <div className="learning-hub">
      <div className="paper-breadcrumb"><Link href="/">나의 책숲</Link><span>/</span>{tabs.find(([id]) => id === tab)?.[1]}</div>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">MY READING JOURNAL</span>
          <h1>
            {teacher
              ? "함께 읽고, 함께 자라는 교실."
              : "읽은 만큼, 자라는 나."}
          </h1>
          <p>{teacher ? "작은 생각을 발견하고, 다음 문장을 응원해 주세요." : `${data.profile.display_name} 님, 오늘의 한 문장을 책숲에 남겨 보세요.`}</p>
          {data.classes.length > 0 && <span className="paper-class-label">{data.classes[0].name}{data.classes.length > 1 ? ` 외 ${data.classes.length - 1}개 학급` : ""}</span>}
        </div>
        <div className="button-row">
          <RefreshButton/>
          {!teacher && tab === "reading" && data.profile.consent_status === "verified" && <button className="button button-primary" onClick={() => {
            const editor = document.getElementById("reading-editor");
            if (editor instanceof HTMLDetailsElement) { editor.open = true; editor.scrollIntoView({ behavior: readingScrollBehavior(), block: "start" }); }
          }}><PenLine size={16} />독서 기록 쓰기</button>}
          <Link className={teacher ? "button button-primary" : "paper-text-link"} href={teacher ? "/operations" : "/app?view=missions"}>{teacher ? "학생 계정·기록 관리" : "미션 이어하기"}<ArrowRight size={15} /></Link>
        </div>
      </div>
      <nav className="workspace-tabs" aria-label="책장과 성장 메뉴">
        {tabs.map(([id, label]) => (
          <Link
            key={id}
            className={`hub-tab ${tab === id ? "selected" : ""}`}
            aria-current={tab === id ? "page" : undefined}
            href={`/hub?tab=${id}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {!data.schemaReady ? (
        <div className="notice">
          <strong>새 교실 기능 연결을 준비하고 있어요.</strong> 기록·성장·경제
          교실을 사용할 데이터베이스 구성이 필요합니다. 기존 독서미션과 놀이터는
          계속 이용할 수 있어요.
        </div>
      ) : (
        <>
          {data.truncated.length > 0 && (
            <div className="notice">
              학급 참고 목록이 많아 일부가 표시되지 않습니다. 운영자에게 학급별
              조회 설정을 문의해 주세요.
            </div>
          )}
          {data.profile.role === "student" &&
          data.profile.consent_status !== "verified" ? (
            <>
              <div className="notice">
                참여 동의 확인을 기다리고 있어요. 동의 확인 전에는
                독서·공유·보상·구매 기능을 이용할 수 없습니다.
              </div>
              <Management data={data} />
            </>
          ) : (
            <>
              {tab === "today" && dashboard && <Today data={dashboard} hub={data}/>}
              {tab === "review" && teacher && dashboard && participation && <ReviewQueue data={dashboard} hub={data} extra={participation}/>}
              {tab === "packs" && teacher && participation && <LessonPacks hub={data} extra={participation}/>}
              {tab === "exhibitions" && participation && <Exhibitions hub={data} extra={participation} google={google}/>}
              {tab === "reading" && <div className="paper-dashboard"><div className="paper-main"><Bookshelf data={data} /></div><PaperGrowth data={data} /></div>}
              {tab === "exports" && (
                <Exports key={data.page} data={data} google={google} googleNotice={googleNotice} />
              )}
              {tab === "growth" && <><Character data={data} />{participation&&<SharedForest hub={data} extra={participation}/>}</>}
              {tab === "plaza" && <Plaza data={data} />}
              {tab === "economy" && <>{participation&&<EconomyLab hub={data} extra={participation}/>}<Economy data={data} /></>}
              {tab === "manage" && <Management data={data} />}
              {!teacher && !data.classes.length && tab !== "manage" && (
                <Management data={data} />
              )}
              {!["today","packs"].includes(tab)&&<nav className="hub-row" aria-label="기록 페이지">
                {data.page > 1 && (
                  <Link
                    className="button button-outline"
                    href={`/hub?tab=${tab}&page=${data.page - 1}`}
                  >
                    이전 기록
                  </Link>
                )}
                <p>
                  {data.page}페이지 · 목록별 최대 100개 · 경험치·지갑은 전체
                  기록 기준
                </p>
                {data.hasNext && (
                  <Link
                    className="button button-outline"
                    href={`/hub?tab=${tab}&page=${data.page + 1}`}
                  >
                    다음 기록
                  </Link>
                )}
              </nav>}
            </>
          )}
        </>
      )}
    </div>
  );
}
