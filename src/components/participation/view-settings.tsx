"use client";
import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
type Preferences = { large: boolean; contrast: boolean; calm: boolean };
const empty: Preferences = { large: false, contrast: false, calm: false };
export function ViewSettings() {
  const [prefs, setPrefs] = useState<Preferences>(empty);
  function apply(next: Preferences) {
    const root = document.documentElement;
    root.dataset.textSize = next.large ? "large" : "normal";
    root.dataset.contrast = next.contrast ? "high" : "normal";
    root.dataset.motion = next.calm ? "reduce" : "normal";
  }
  useEffect(() => {
    try {
      const raw = JSON.parse(
        localStorage.getItem("bookforest.view.v1") ?? "{}",
      );
      const next = {
        large: raw.large === true,
        contrast: raw.contrast === true,
        calm: raw.calm === true,
      };
      setPrefs(next);
      apply(next);
    } catch {
      /* Browser defaults remain available when storage is blocked. */
    }
  }, []);
  function change(key: keyof Preferences, checked: boolean) {
    const next = { ...prefs, [key]: checked };
    setPrefs(next);
    apply(next);
    try {
      localStorage.setItem("bookforest.view.v1", JSON.stringify(next));
    } catch {
      /* Preferences still apply for this visit. */
    }
  }
  return (
    <details className="view-settings">
      <summary aria-label="보기 설정"><SlidersHorizontal size={18} aria-hidden="true" /><span>보기 설정</span></summary>
      <div>
        <strong>편하게 읽어요</strong>
        {(
          [
            ["large", "큰 글씨"],
            ["contrast", "더 뚜렷한 대비"],
            ["calm", "움직임 줄이기"],
          ] as const
        ).map(([key, label]) => (
          <label className="hub-check" key={key}>
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => change(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
        <p>
          이 기기에 보기 설정만 저장해요. 글과 계정 정보는 저장하지 않습니다.
        </p>
      </div>
    </details>
  );
}
