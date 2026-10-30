"use client";
import { growth } from "@/lib/studio";
import { missions } from "@/lib/missions";
import { VersionComparison } from "@/components/writing-diff";
import { Panel, type ToolProps } from "./shared";

export function AdventureMap({ state, go }: ToolProps) {
  const g = growth(state);
  const needsRevision = missions.find(
    (m) => m.id === state.demo.missionId,
  )!.requires_revision;
  const zones = [
    {
      title: "용기의 숲",
      icon: "🌲",
      open: true,
      completed: g.complete,
      tool: "classroom",
      activity: needsRevision
        ? "초고 → 피드백 → 고쳐 쓰기"
        : "내 생각 쓰기 → 피드백 → 완료",
      story:
        "모모의 작은 목소리가 숲길을 열었어요. 내 생각도 한 문장부터 꺼내 보세요.",
      progress: [
        state.demo.assigned,
        state.demo.versions.length > 0,
        ...(needsRevision ? [g.revision] : []),
        g.complete,
      ],
    },
    {
      title: "공감의 정원",
      icon: "🌷",
      open: g.complete,
      completed: g.empathy,
      tool: "interview",
      activity: "인물에게 묻고 책에서 근거 찾기",
      story:
        "참새가 지켜 준 것은 씨앗뿐이었을까요? 다른 마음의 이야기를 들어 보아요.",
      progress: [g.empathy],
    },
    {
      title: "공정의 마을",
      icon: "🏡",
      open: g.complete && g.empathy,
      completed: g.fairness,
      tool: "village",
      activity: "선택 → 까닭 → 다른 입장 살피기",
      story:
        "열매를 나누는 방법은 하나일까요? 모두의 목소리가 담긴 약속을 찾아요.",
      progress: [g.fairness],
    },
  ];
  return (
    <>
      <div className="adventure-banner">
        <span aria-hidden="true">🧭</span>
        <div>
          <h2>나의 속도로 걷는 인문 여행</h2>
          <p>
            활동을 마치면 다음 마을의 이야기가 열려요. 학습 도구는 언제든
            자유롭게 이용할 수 있어요.
          </p>
        </div>
        <strong>{zones.filter((z) => z.completed).length} / 3곳 탐험</strong>
      </div>
      <div className="adventure-map">
        {zones.map((z, index) => (
          <article
            key={z.title}
            className={`map-zone zone-${index} ${z.open ? "" : "zone-locked"}`}
          >
            <span className="zone-number">{index + 1}번째 여정</span>
            <span className="zone-illustration" aria-hidden="true">
              {z.icon}
            </span>
            <h3>{z.title}</h3>
            <span className="status-pill">
              {!z.open
                ? "앞 여정을 마치면 이야기 열림"
                : z.completed
                  ? "탐험 기록 있음"
                  : "탐험할 수 있어요"}
            </span>
            <p>
              {z.open
                ? z.story
                : index === 1
                  ? "용기의 숲 미션을 완료하면 열려요."
                  : "용기의 숲을 마치고 인물 인터뷰를 보관하면 열려요."}
            </p>
            <progress
              aria-label={`${z.title} 활동 진행`}
              value={z.progress.filter(Boolean).length}
              max={z.progress.length}
            />
            <small>{z.activity}</small>
            <button
              className="button button-primary"
              onClick={() => go(z.tool)}
            >
              {z.open ? "여정 이어가기" : "활동 먼저 살펴보기"}
            </button>
          </article>
        ))}
      </div>
      <Panel title="작은 발견도 여행의 한 부분이에요">
        <p>
          생각 카드, 인물 인터뷰, 성찰 기록, 수정본 등 서로 다른 활동이
          생각나무의 잎이 돼요. 출석 일수나 글자 수로 경쟁하지 않아요.
        </p>
        <button className="button button-outline" onClick={() => go("garden")}>
          내 생각나무 만나기
        </button>
      </Panel>
    </>
  );
}

export function ThoughtGarden({ state, update }: ToolProps) {
  const g = growth(state),
    garden = state.garden;
  const leaves = [
    [90, 90],
    [160, 63],
    [230, 90],
    [65, 145],
    [135, 130],
    [215, 135],
    [260, 154],
    [170, 180],
  ];
  const styles = [
    { id: "meadow", label: "초록 들판" },
    { id: "sunset", label: "노을 정원" },
    { id: "night", label: "별빛 숲" },
  ] as const;
  const decorations = [
    {
      id: "none",
      label: "꾸밈 없이",
      available: true,
      help: "나무를 그대로 감상해요",
    },
    {
      id: "flowers",
      label: "들꽃",
      available: g.flowers,
      help: "생각 카드 또는 인터뷰 작품 보관",
    },
    {
      id: "lantern",
      label: "등불",
      available: g.lantern,
      help: "고친 글을 새 버전으로 제출",
    },
    {
      id: "bird",
      label: "작은 새",
      available: g.bird,
      help: "인물 인터뷰 기사 보관",
    },
  ] as const;
  return (
    <div className="studio-two-col">
      <div className={`garden-scene garden-${garden.ground}`}>
        <span className="garden-caption">생각이 자라는 나의 작은 숲</span>
        <svg
          viewBox="0 0 340 340"
          role="img"
          aria-label={`생각나무에 활동 잎 ${g.leaves}개와 ${decorations.find((d) => d.id === garden.decoration)!.label} 장식`}
        >
          <ellipse cx="170" cy="295" rx="137" ry="25" fill="#98b783" />
          <path
            d="M171 286V125M171 213L104 142M172 173L223 109M169 141L155 88M172 245L249 181"
            stroke="#986d46"
            strokeWidth="15"
            fill="none"
            strokeLinecap="round"
          />
          {leaves.map(([x, y], n) => (
            <ellipse
              key={n}
              cx={x}
              cy={y}
              rx="35"
              ry="27"
              transform={`rotate(${n % 2 ? -30 : 30} ${x} ${y})`}
              fill={n < g.leaves ? (n % 2 ? "#8eae6a" : "#4f845c") : "#cfddc4"}
              opacity={n < g.leaves ? 1 : 0.45}
            />
          ))}
          <text x="164" y="110" fontSize="30">
            🌱
          </text>
          {garden.decoration === "flowers" && (
            <text x="80" y="294" fontSize="34">
              🌼 🌷
            </text>
          )}
          {garden.decoration === "lantern" && (
            <text x="205" y="204" fontSize="40">
              🏮
            </text>
          )}
          {garden.decoration === "bird" && (
            <text x="210" y="103" fontSize="37">
              🐦
            </text>
          )}
        </svg>
        <strong>서로 다른 활동에서 자란 잎 {g.leaves} / 8개</strong>
        <p>쉬었다 와도 나무는 그대로 기다려요.</p>
      </div>
      <Panel
        title="책숲 꾸미기"
        intro="배경은 자유롭게 고르고, 장식은 활동을 통해 만나요. 구매나 순위 경쟁은 없어요."
      >
        <fieldset className="garden-options">
          <legend>정원 배경</legend>
          {styles.map((style) => (
            <label key={style.id}>
              <input
                type="radio"
                name="garden-ground"
                checked={garden.ground === style.id}
                onChange={() =>
                  update((s) => ({
                    ...s,
                    garden: { ...s.garden, ground: style.id },
                  }))
                }
              />
              {style.label}
            </label>
          ))}
        </fieldset>
        <fieldset className="garden-options">
          <legend>나의 장식</legend>
          {decorations.map((d) => (
            <label
              key={d.id}
              className={!d.available ? "locked-decoration" : ""}
            >
              <input
                type="radio"
                name="garden-decoration"
                disabled={!d.available}
                checked={garden.decoration === d.id}
                onChange={() =>
                  update(
                    (s) => ({
                      ...s,
                      garden: { ...s.garden, decoration: d.id },
                    }),
                    `${d.label} 장식을 골랐어요.`,
                  )
                }
              />
              <span>
                {d.label}
                <small>{d.available ? "사용할 수 있어요" : d.help}</small>
              </span>
            </label>
          ))}
        </fieldset>
      </Panel>
    </div>
  );
}

export function CompareRoom({ state, go }: ToolProps) {
  return (
    <Panel
      title="내 생각이 달라진 자리"
      intro="빼거나 보탠 표현을 살펴보고 어떤 생각이 더 잘 전해지는지 읽어 보세요."
    >
      <VersionComparison versions={state.demo.versions} />
      <div className="button-row">
        <button
          className="button button-outline"
          onClick={() => go("classroom")}
        >
          체험 교실에서 고쳐 쓰기
        </button>
      </div>
    </Panel>
  );
}
