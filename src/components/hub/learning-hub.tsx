"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Bookshelf } from "./bookshelf";
import { Character, Economy } from "./growth-economy";
import { Management, Plaza } from "./community";
import { Exports } from "./exports";
import type { HubData } from "@/lib/hub-data";
export function LearningHub({
  data,
  initialTab,
  google,
}: {
  data: HubData;
  initialTab?: string;
  google: { configured: boolean; connected: boolean };
}) {
  const teacher = data.profile.role === "teacher";
  const tabs = [
    ["reading", "나의 책장"],
    ["exports", "기록·글 내보내기"],
    ["growth", "캐릭터·배지"],
    ["plaza", "학급 광장"],
    ["economy", "경제 교실"],
    ["manage", teacher ? "학급·학년 관리" : "학급 연결"],
  ];
  const tab = tabs.some(([id]) => id === initialTab) ? initialTab! : "reading";
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
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">READ · WRITE · GROW TOGETHER</span>
          <h1>
            {teacher
              ? "함께 자라는 우리 교실"
              : `${data.profile.display_name}의 책장`}
          </h1>
          <p>읽은 책 한 권, 고쳐 쓴 한 문장. 나의 작은 숲이 자라요.</p>
        </div>
        <Link className="button button-outline" href="/app">
          독서미션·글쓰기 활동
        </Link>
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
              {tab === "reading" && <Bookshelf data={data} />}{" "}
              {tab === "exports" && (
                <Exports key={data.page} data={data} google={google} />
              )}
              {tab === "growth" && <Character data={data} />}
              {tab === "plaza" && <Plaza data={data} />}
              {tab === "economy" && <Economy data={data} />}
              {tab === "manage" && <Management data={data} />}
              {!teacher && !data.classes.length && tab !== "manage" && (
                <Management data={data} />
              )}
              <nav className="hub-row" aria-label="기록 페이지">
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
              </nav>
            </>
          )}
        </>
      )}
    </div>
  );
}
