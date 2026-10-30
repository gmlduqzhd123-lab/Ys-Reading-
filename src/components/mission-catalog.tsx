"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  Search,
  Heart,
  Feather,
  Scale,
  ArrowRight,
} from "lucide-react";
import { missions, themes, type Mission } from "@/lib/missions";

const icons = { courage: Feather, empathy: Heart, fairness: Scale };
const kinds = {
  question: "질문 만들기",
  writing: "생각 쓰기",
  revision: "고쳐 쓰기",
};

export function MissionCard({ mission }: { mission: Mission }) {
  const Icon = icons[mission.theme];
  return (
    <Link
      className={`mission-card theme-${mission.theme}`}
      href={`/missions/${mission.slug}`}
    >
      <div className="mission-art">
        <span className="mission-kind">{kinds[mission.kind]}</span>
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
        <div className="mission-emblem">
          <Icon strokeWidth={1.3} size={47} />
        </div>
        <span className="art-label">{themes[mission.theme].label}</span>
        <span className="mission-arrow">
          <ArrowUpRight size={20} />
        </span>
      </div>
      <div className="mission-card-body">
        <div className="mission-meta">
          <span>{mission.grade_band.replace("-", "–")}학년</span>
          <span>·</span>
          <span>
            <Clock3 size={12} />약 {mission.minutes}분
          </span>
        </div>
        <h3>{mission.title}</h3>
        <p>{mission.description}</p>
        <div className="mission-card-bottom">
          <span className="topic-tag">#{themes[mission.theme].label}</span>
          <span>
            미션 살펴보기 <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function MissionCatalog({ preview = false }: { preview?: boolean }) {
  const [theme, setTheme] = useState("all");
  const [grade, setGrade] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () =>
      missions.filter(
        (m) =>
          (theme === "all" || m.theme === theme) &&
          (grade === "all" || m.grade_band === grade) &&
          `${m.title} ${m.description} ${themes[m.theme].label}`.includes(
            search.trim(),
          ),
      ),
    [theme, grade, search],
  );
  const display =
    preview && theme === "all" && !search && grade === "all"
      ? [
          missions.find((m) => m.theme === "courage" && m.kind === "writing")!,
          missions.find((m) => m.theme === "empathy" && m.kind === "question")!,
          missions.find((m) => m.theme === "fairness" && m.kind === "writing")!,
        ]
      : preview
        ? filtered.slice(0, 3)
        : filtered;
  return (
    <section className="catalog-section" aria-label="독서미션 목록">
      <div className="section-heading">
        <div>
          <div className="eyebrow">A LITTLE QUESTION, A BIG ADVENTURE</div>
          <h2>
            {preview ? "어떤 생각을 만나 볼까요?" : "나에게 맞는 미션을 찾아요"}
          </h2>
        </div>
        {preview && (
          <Link className="text-link" href="/missions">
            모든 미션 보기 <ArrowRight size={16} />
          </Link>
        )}
      </div>
      <div className="catalog-toolbar">
        <div className="filter-tabs" role="group" aria-label="주제 선택">
          {[
            { key: "all", label: "전체" },
            ...Object.entries(themes).map(([key, value]) => ({
              key,
              label: value.label,
            })),
          ].map((t) => (
            <button
              className={theme === t.key ? "selected" : ""}
              aria-pressed={theme === t.key}
              onClick={() => setTheme(t.key)}
              key={t.key}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="filter-controls">
          <label className="sr-only" htmlFor="grade-filter">
            학년 선택
          </label>
          <select
            id="grade-filter"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            <option value="all">모든 학년</option>
            <option value="3-4">3–4학년</option>
            <option value="5-6">5–6학년</option>
          </select>
          {!preview && (
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="미션 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="미션 검색"
              />
            </div>
          )}
        </div>
      </div>
      <div className="mission-grid">
        {display.map((m) => (
          <MissionCard key={m.id} mission={m} />
        ))}
      </div>
      {display.length === 0 && (
        <div className="empty-state">
          <Search size={30} />
          <h3>아직 맞는 미션을 찾지 못했어요.</h3>
          <p>다른 검색어나 학년을 선택해 보세요.</p>
          <button
            className="button button-outline"
            onClick={() => {
              setSearch("");
              setGrade("all");
              setTheme("all");
            }}
          >
            필터 초기화
          </button>
        </div>
      )}
      {!preview && (
        <p className="result-count" aria-live="polite">
          {filtered.length}개의 미션 · 읽기 시간은 활동 시간에 포함되지 않아요.
        </p>
      )}
    </section>
  );
}
