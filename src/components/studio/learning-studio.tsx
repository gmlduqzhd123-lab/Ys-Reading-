"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Compass,
  Flower2,
  GraduationCap,
  GitCompareArrows,
  Map,
  MessageCircle,
  Newspaper,
  PencilLine,
  Sprout,
  Trophy,
} from "lucide-react";
import {
  initialStudio,
  readStudio,
  STUDIO_KEY,
  studioSchema,
  type StudioState,
} from "@/lib/studio";
import { DemoRoom } from "./demo-room";
import {
  CharacterInterview,
  ChoiceVillage,
  WritingCards,
} from "./creative-tools";
import { AdventureMap, CompareRoom, ThoughtGarden } from "./growth-tools";
import {
  FestivalWorkshop,
  FirstPortfolio,
  MissionMaker,
} from "./teacher-tools";
import type { UpdateStudio } from "./shared";
import { BackupRestore } from "./backup-restore";
import { createStudioBackup, restoreStudioBackup } from "@/lib/studio-backup";

const tools = [
  {
    id: "classroom",
    title: "체험 교실",
    subtitle: "학생과 선생님이 되어 보기",
    icon: GraduationCap,
  },
  {
    id: "map",
    title: "인문 모험 지도",
    subtitle: "세 마을로 떠나는 여행",
    icon: Map,
  },
  {
    id: "garden",
    title: "생각나무 꾸미기",
    subtitle: "생각의 잎을 키워요",
    icon: Sprout,
  },
  {
    id: "cards",
    title: "글쓰기 카드",
    subtitle: "막막한 첫 문장의 시작",
    icon: PencilLine,
  },
  {
    id: "compare",
    title: "고친 글 비교실",
    subtitle: "달라진 생각을 나란히",
    icon: GitCompareArrows,
  },
  {
    id: "interview",
    title: "인물 인터뷰",
    subtitle: "책 속 인물의 마음 만나기",
    icon: Newspaper,
  },
  {
    id: "village",
    title: "선택의 마을",
    subtitle: "나라면 어떻게 할까?",
    icon: MessageCircle,
  },
  {
    id: "maker",
    title: "미션 제작실",
    subtitle: "선생님의 새로운 질문",
    icon: BookOpen,
  },
  {
    id: "festival",
    title: "대회 준비 공방",
    subtitle: "읽고 점검하고 출품해요",
    icon: Trophy,
  },
  {
    id: "portfolio",
    title: "나의 첫 작품집",
    subtitle: "내 이야기가 한 권의 책으로",
    icon: Flower2,
  },
];
export function LearningStudio() {
  const [state, setState] = useState<StudioState | null>(null);
  const stateRef = useRef<StudioState | null>(null);
  const rawRef = useRef<string | null>(null);
  const blockedRef = useRef(false);
  const unsavedRef = useRef(false);
  const unreadableRef = useRef(false);
  const conflictRef = useRef(false);
  const [tool, setTool] = useState("home");
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [saved, setSaved] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STUDIO_KEY);
      rawRef.current = raw;
      const loaded = raw ? readStudio(raw) : initialStudio();
      stateRef.current = loaded;
      setState(loaded);
      setSaved(Boolean(raw));
    } catch (error) {
      blockedRef.current = true;
      unreadableRef.current = true;
      stateRef.current = initialStudio();
      setState(stateRef.current);
      setProblem(
        error instanceof Error
          ? error.message
          : "이 브라우저의 저장 공간을 사용할 수 없어요.",
      );
    }
    const changed = (event: StorageEvent) => {
      if (
        (event.key === STUDIO_KEY || event.key === null) &&
        event.newValue !== rawRef.current
      ) {
        blockedRef.current = true;
        conflictRef.current = true;
        setSaved(false);
        setProblem(
          "다른 탭에서 체험 기록이 바뀌었어요. 덮어쓰지 않도록 입력을 멈췄어요. 새로 불러오기를 눌러 주세요.",
        );
      }
    };
    window.addEventListener("storage", changed);
    const warn = (event: BeforeUnloadEvent) => {
      if (unsavedRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
  const update: UpdateStudio = (change, notice) => {
    if (!stateRef.current || blockedRef.current) return false;
    try {
      if (localStorage.getItem(STUDIO_KEY) !== rawRef.current) {
        blockedRef.current = true;
        conflictRef.current = true;
        throw new Error(
          "다른 탭에서 기록이 바뀌었어요. 새로 불러온 뒤 이어가 주세요.",
        );
      }
      const next = studioSchema.parse(change(stateRef.current));
      const raw = JSON.stringify(next);
      // A failed write keeps the new writing in memory so it can still be copied/exported.
      stateRef.current = next;
      setState(next);
      try {
        localStorage.setItem(STUDIO_KEY, raw);
      } catch {
        unsavedRef.current = true;
        throw new Error(
          "이 기기에 저장하지 못했어요. 현재 화면의 글은 남아 있어요. 기록 백업으로 보관한 뒤 다시 저장해 주세요.",
        );
      }
      rawRef.current = raw;
      unsavedRef.current = false;
      setSaved(true);
      setProblem("");
      setMessage(notice ?? "");
      return true;
    } catch (error) {
      setSaved(false);
      setProblem(
        error instanceof Error && !error.message.startsWith("[")
          ? error.message
          : "입력 길이와 내용을 확인해 주세요.",
      );
      return false;
    }
  };
  function go(id: string) {
    setTool(tools.some((t) => t.id === id) ? id : "home");
    setMessage("");
    requestAnimationFrame(() => headingRef.current?.focus());
  }
  function reset() {
    try {
      const next = initialStudio(),
        raw = JSON.stringify(next);
      localStorage.setItem(STUDIO_KEY, raw);
      rawRef.current = raw;
      stateRef.current = next;
      blockedRef.current = false;
      unsavedRef.current = false;
      unreadableRef.current = false;
      conflictRef.current = false;
      setState(next);
      setSaved(true);
      setProblem("");
      setMessage("이 브라우저의 체험 기록을 초기화했어요.");
      setTool("home");
    } catch {
      setProblem(
        "초기화한 기록을 저장하지 못했어요. 브라우저의 저장 공간 설정을 확인해 주세요.",
      );
    }
  }
  function backup() {
    if (!stateRef.current) return;
    try {
      const raw = unreadableRef.current
        ? rawRef.current
        : createStudioBackup(stateRef.current);
      if (raw === null)
        throw new Error("저장된 원본 기록을 읽을 수 없어 백업하지 못했어요.");
      const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = unreadableRef.current
        ? "책숲-읽지못한기록-원본.json"
        : "책숲-체험기록-백업.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (unreadableRef.current)
        setMessage(
          "읽지 못한 기록의 원본을 내려받았어요. 이 파일은 바로 복원되지 않을 수 있어요.",
        );
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "백업 파일을 만들지 못했어요.",
      );
    }
  }
  function getStoredRaw() {
    let raw: string | null;
    try {
      raw = localStorage.getItem(STUDIO_KEY);
    } catch {
      throw new Error("이 브라우저의 저장 공간을 확인하지 못했어요.");
    }
    if (raw !== rawRef.current || conflictRef.current) {
      blockedRef.current = true;
      conflictRef.current = true;
      throw new Error(
        "다른 탭의 기록을 먼저 새로 불러온 뒤 백업을 선택해 주세요.",
      );
    }
    return raw;
  }
  function restore(
    candidate: StudioState,
    expectedState: StudioState,
    expectedRaw: string | null,
  ) {
    try {
      if (conflictRef.current || expectedState !== stateRef.current)
        throw new Error(
          "백업을 고른 뒤 현재 기록이 바뀌었어요. 새로 불러오거나 파일을 다시 선택해 주세요.",
        );
      const raw = restoreStudioBackup(localStorage, candidate, expectedRaw);
      const restored = readStudio(raw);
      rawRef.current = raw;
      stateRef.current = restored;
      blockedRef.current = false;
      conflictRef.current = false;
      unreadableRef.current = false;
      unsavedRef.current = false;
      setState(restored);
      setSaved(true);
      setProblem("");
      setMessage("백업의 체험 기록을 이 브라우저에 복원했어요.");
      setTool("home");
      return true;
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "복원하지 못했어요. 기존 기록은 그대로 있어요.",
      );
      return false;
    }
  }
  const selected = tools.find((t) => t.id === tool);
  const props = state ? { state, update, go } : null;
  return (
    <div className="learning-studio">
      <div className="studio-header">
        <span className="eyebrow">BOOKFOREST PLAY & CREATE</span>
        <h1 ref={headingRef} tabIndex={-1}>
          {selected?.title ?? "생각이 노는 책숲 놀이터"}
        </h1>
        <p>
          {selected?.subtitle ??
            "묻고, 쓰고, 고치고, 나만의 이야기를 한 권으로."}
        </p>
      </div>
      <div className="studio-banner">
        <strong>로그인 없는 기기 내 체험</strong>
        <p>
          학습 글과 보관 작품은 이 브라우저에 기록돼요. 실제 교실·대회로
          전송되지 않아요. 공용 기기에서는 체험 후 초기화해 주세요. 브라우저
          기록을 지우면 함께 사라질 수 있어요.
        </p>
        <div className="studio-toolsbar">
          <span role="status">
            {saved
              ? "이 브라우저에 기록됨"
              : problem
                ? "저장 상태를 확인해 주세요"
                : "아직 이 브라우저에 기록 전"}
          </span>
          <button onClick={backup} disabled={!state}>
            기록 백업
          </button>
          <BackupRestore
            state={state}
            getStoredRaw={getStoredRaw}
            onRestore={restore}
          />
          <button
            onClick={() => update((s) => s, "이 브라우저에 다시 저장했어요.")}
            disabled={!state}
          >
            다시 저장
          </button>
          <details>
            <summary>체험 초기화</summary>
            <div>
              <p>
                이 기기의 글·활동·미션·꾸미기를 모두 초기화해요. 필요한 작품집과
                기록을 먼저 내려받으세요.
              </p>
              <button className="button button-outline" onClick={reset}>
                모든 체험 기록 초기화 확인
              </button>
            </div>
          </details>
        </div>
      </div>
      {problem && (
        <div className="studio-alert" role="alert">
          <p>{problem}</p>
          <button
            className="button button-outline"
            onClick={() => window.location.reload()}
          >
            새로 불러오기
          </button>
        </div>
      )}
      {message && (
        <p className="studio-message" role="status">
          {message}
        </p>
      )}
      <nav className="studio-nav" aria-label="책숲 놀이터 도구">
        <button
          aria-current={tool === "home" ? "page" : undefined}
          onClick={() => go("home")}
        >
          <Compass size={17} />
          전체 도구
        </button>
        {tools.map((t) => (
          <button
            key={t.id}
            aria-current={tool === t.id ? "page" : undefined}
            onClick={() => go(t.id)}
          >
            <t.icon size={17} />
            {t.title}
          </button>
        ))}
      </nav>
      {!props ? (
        <p role="status">이 브라우저의 활동 기록을 불러오고 있어요…</p>
      ) : (
        <div className="studio-content">
          {tool === "home" && (
            <>
              <div className="studio-welcome">
                <span aria-hidden="true">🌿</span>
                <div>
                  <h2>오늘은 어떤 생각을 키워 볼까요?</h2>
                  <p>
                    처음이라면 체험 교실에서 선생님과 학생 역할을 바꾸며 시작해
                    보세요.
                  </p>
                  <button
                    className="button button-primary"
                    onClick={() => go("classroom")}
                  >
                    체험 교실에서 시작하기
                  </button>
                </div>
              </div>
              <div className="studio-tool-grid">
                {tools.map((t, n) => (
                  <button
                    className={`studio-tool-card tool-color-${n % 4}`}
                    key={t.id}
                    onClick={() => go(t.id)}
                  >
                    <span className="tool-card-icon">
                      <t.icon size={27} />
                    </span>
                    <span className="eyebrow">
                      {String(n + 1).padStart(2, "0")}
                    </span>
                    <strong>{t.title}</strong>
                    <span>{t.subtitle}</span>
                    <small>열어 보기 →</small>
                  </button>
                ))}
              </div>
            </>
          )}
          {tool === "classroom" && <DemoRoom {...props} />}
          {tool === "map" && <AdventureMap {...props} />}
          {tool === "garden" && <ThoughtGarden {...props} />}
          {tool === "cards" && <WritingCards {...props} />}
          {tool === "compare" && <CompareRoom {...props} />}
          {tool === "interview" && <CharacterInterview {...props} />}
          {tool === "village" && <ChoiceVillage {...props} />}
          {tool === "maker" && <MissionMaker {...props} />}
          {tool === "festival" && <FestivalWorkshop {...props} />}
          {tool === "portfolio" && <FirstPortfolio {...props} />}
        </div>
      )}
    </div>
  );
}
