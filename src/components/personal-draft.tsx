"use client";
import { SaveStatus } from "@/components/save-status";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { draftKey } from "@/lib/teacher-draft";
import {
  getPersonalDraftVault,
  lockPersonalDrafts,
  personalDraftEvent,
  type PersonalDraft,
} from "@/lib/personal-draft-vault";
const tell: Record<string, string> = {
  LOCAL_VAULT_EXISTS:
    "다른 탭에서 이미 보관을 설정했어요. 기기 보관을 다시 확인해 주세요.",
  LOCAL_VAULT_LOCKED: "암호화 보관이 잠겼어요. 암호를 입력해 다시 열어 주세요.",
  LOCAL_UNLOCK_FAILED:
    "보관 암호를 확인해 주세요. 기존 파일을 덮어쓰지 않았어요.",
  LOCAL_DRAFT_CONFLICT:
    "다른 탭의 암호화 초안이 바뀌었어요. 보관본을 다시 읽고 현재 입력과 비교해 주세요.",
  LOCAL_STORAGE_FULL:
    "이 기기의 보관 공간이 부족해요. 현재 글을 파일로 보관해 주세요.",
  LOCAL_DRAFT_TOO_LARGE:
    "이 입력은 기기 보관 한도를 넘어요. 파일 보관을 이용해 주세요.",
  LOCAL_VAULT_UNAVAILABLE:
    "이 브라우저에서는 안전한 기기 보관을 사용할 수 없어요. 파일 보관을 이용해 주세요.",
};
export function PersonalDraftAccess({ owner }: { owner: string }) {
  const [configured, setConfigured] = useState(false),
    [unlocked, setUnlocked] = useState(false),
    [pass, setPass] = useState(""),
    [repeat, setRepeat] = useState(""),
    [personal, setPersonal] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false);
  const refresh = () => {
    try {
      const v = getPersonalDraftVault();
      setConfigured(v.configured(owner));
      setUnlocked(v.isUnlocked(owner));
    } catch {
      setMessage(tell.LOCAL_VAULT_UNAVAILABLE);
    }
  };
  useEffect(() => {
    setPass("");
    setRepeat("");
    setPersonal(false);
    setBlocked(false);
    refresh();
    window.addEventListener(personalDraftEvent, refresh);
    const timer = setInterval(refresh, 60000),
      {
        data: { subscription },
      } = createClient().auth.onAuthStateChange((event, s) => {
        if (event === "SIGNED_OUT" || (s?.user && s.user.id !== owner)) {
          setBlocked(true);
          setPass("");
          setRepeat("");
          setPersonal(false);
          lockPersonalDrafts();
        }
      });
    return () => {
      window.removeEventListener(personalDraftEvent, refresh);
      clearInterval(timer);
      subscription.unsubscribe();
    };
  }, [owner]);
  async function open() {
    if (blocked) return;
    if (!personal) {
      setMessage("본인만 사용하는 개인 기기인지 먼저 확인해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const v = getPersonalDraftVault();
      if (configured) await v.unlock(owner, pass);
      else await v.configure(owner, pass, repeat);
      setPass("");
      setRepeat("");
      window.dispatchEvent(new Event(personalDraftEvent));
      setMessage("이 기기의 암호화 초안 보관을 열었어요.");
    } catch (e) {
      setMessage(
        tell[(e as Error).message] ??
          "20자 이상의 같은 보관 암호를 입력해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (blocked)
    return <p role="status">로그인 계정이 바뀌어 기기 보관을 잠갔어요.</p>;
  return (
    <details
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          e.target instanceof HTMLInputElement &&
          e.target.type === "password"
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (!busy) void open();
        }
      }}
    >
      <summary>개인 기기 암호화 초안 보관</summary>
      <p>
        공용 PC에서는 사용하지 마세요. 직접 선택한 개인 기기에만 초안을 암호화해
        최대 10개 보관하며 7일 이내 초안만 불러옵니다. 만료 자료는 다음 사용 시
        정리합니다. 암호와 복호화 키는 서버에 보내거나 저장하지 않습니다. 다시
        열 때 보관 암호가 필요하며 분실하면 복구할 수 없어요.
      </p>
      {unlocked ? (
        <button
          type="button"
          className="button button-outline"
          onClick={lockPersonalDrafts}
        >
          기기 초안 보관 잠그기
        </button>
      ) : (
        <>
          <label className="hub-check">
            <input
              type="checkbox"
              checked={personal}
              onChange={(e) => setPersonal(e.target.checked)}
            />
            본인만 사용하는 개인 기기입니다
          </label>
          <label className="field">
            기기 보관 암호
            <input
              type="password"
              autoComplete="off"
              value={pass}
              minLength={20}
              maxLength={256}
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
          {!configured && (
            <label className="field">
              기기 보관 암호 다시 입력
              <input
                type="password"
                autoComplete="off"
                value={repeat}
                maxLength={256}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </label>
          )}
          <button
            type="button"
            className="button button-outline"
            disabled={busy || !personal}
            onClick={() => void open()}
          >
            {busy
              ? "암호화 보관을 여는 중…"
              : configured
                ? "기기 초안 보관 열기"
                : "이 개인 기기에 암호화 보관 설정"}
          </button>
        </>
      )}
      {configured && (
        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "이 계정의 이 기기 암호화 초안을 모두 지울까요? 서버 기록과 보관 파일은 유지됩니다.",
              )
            )
              void getPersonalDraftVault()
                .forget(owner)
                .then(() => {
                  window.dispatchEvent(new Event(personalDraftEvent));
                  setMessage("이 계정의 기기 보관을 지웠어요.");
                })
                .catch(() =>
                  setMessage(
                    "기기 보관을 지우지 못했어요. 다른 탭을 닫고 다시 시도해 주세요.",
                  ),
                );
          }}
        >
          이 기기 보관 지우기
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
export function PersonalDraftTools({
  owner,
  scope,
  context,
  payload,
  apply,
  enabled = true,
}: {
  owner: string;
  scope: string;
  context: Record<string, unknown>;
  payload: Record<string, unknown>;
  apply: (p: Record<string, unknown>) => void;
  enabled?: boolean;
}) {
  const identity = draftKey({ owner, scope, context }),
    value = draftKey(payload),
    ref = useRef({ context, payload, apply });
  ref.current = { context, payload, apply };
  const [candidate, setCandidate] = useState<PersonalDraft | null>(null),
    [message, setMessage] = useState(""),
    [tick, setTick] = useState(0),
    [ready, setReady] = useState(false),
    [paused, setPaused] = useState(false),
    [blocked, setBlocked] = useState(false);
  const expected = useRef<string | null>(null),
    saved = useRef(""),
    generation = useRef(0),
    queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    const reload = () => setTick((x) => x + 1);
    window.addEventListener(personalDraftEvent, reload);
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT" || (s?.user && s.user.id !== owner)) {
        generation.current++;
        setBlocked(true);
        setCandidate(null);
        lockPersonalDrafts();
      }
    });
    return () => {
      window.removeEventListener(personalDraftEvent, reload);
      subscription.unsubscribe();
    };
  }, [owner]);
  useEffect(() => {
    let live = true;
    const g = ++generation.current;
    setReady(false);
    setCandidate(null);
    setPaused(false);
    if (!enabled || blocked) return;
    let vault;
    try {
      vault = getPersonalDraftVault();
      if (!vault.isUnlocked(owner)) return;
    } catch {
      return;
    }
    void vault
      .load(owner, scope, ref.current.context)
      .then((p) => {
        if (!live || generation.current !== g) return;
        expected.current = p?.id ?? null;
        saved.current = p ? draftKey(p.payload) : "";
        setCandidate(
          p && draftKey(p.payload) !== draftKey(ref.current.payload) ? p : null,
        );
        setReady(true);
      })
      .catch((e) => {
        if (live) {
          setPaused(true);
          setMessage(
            tell[e.message] ??
              "기기 초안을 확인하지 못했어요. 현재 입력을 파일로 보관해 주세요.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [identity, tick, enabled, blocked, owner, scope]);
  useEffect(() => {
    if (
      !ready ||
      !enabled ||
      blocked ||
      paused ||
      candidate ||
      value === saved.current
    )
      return;
    const g = generation.current,
      timer = setTimeout(() => {
        if (g !== generation.current) return;
        const target = {
          context: ref.current.context,
          payload: ref.current.payload,
        };
        queue.current = queue.current
          .catch(() => {})
          .then(async () => {
            if (g !== generation.current) return null;
            return getPersonalDraftVault().save(
              owner,
              scope,
              target.context,
              target.payload,
              expected.current,
            );
          })
          .then((p) => {
            if (!p || g !== generation.current) return;
            expected.current = p.id;
            saved.current = draftKey(p.payload);
            setMessage(
              "이 기기의 암호화 초안도 보관했어요. 정식 저장·제출은 별도입니다.",
            );
          })
          .catch((e) => {
            setPaused(true);
            setMessage(
              tell[e.message] ??
                "기기 보관에 실패했어요. 입력을 파일로 보관해 주세요.",
            );
          });
      }, 1000);
    return () => clearTimeout(timer);
  }, [
    identity,
    value,
    ready,
    enabled,
    blocked,
    paused,
    candidate,
    owner,
    scope,
  ]);
  const locallySaved = !blocked && !paused && !candidate && !!saved.current && value === saved.current;
  return (
    <aside className="notice">
      {!blocked && <PersonalDraftAccess owner={owner} />}
      {!blocked && candidate && (
        <>
          <p>
            이 기기에 암호화해 보관한 초안이 있어요. 현재 입력과 비교한 뒤
            선택해 주세요.
          </p>
          <details>
            <summary>기기 초안과 현재 입력 비교</summary>
            <p>기기 초안</p>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(candidate.payload, null, 2)}
            </pre>
            <p>현재 입력</p>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              if (
                window.confirm(
                  "이 기기 초안으로 현재 입력을 바꿀까요? 정식 저장·제출은 별도입니다.",
                )
              ) {
                try {
                  ref.current.apply(candidate.payload);
                  setCandidate(null);
                  saved.current = "";
                } catch {
                  setMessage(
                    "현재 계정·학급·활동과 일치하는 초안인지 확인해 주세요.",
                  );
                }
              }
            }}
          >
            기기 초안 불러오기
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              void getPersonalDraftVault()
                .remove(owner, scope, ref.current.context, candidate.id)
                .then(() => {
                  expected.current = null;
                  setCandidate(null);
                  saved.current = "";
                })
                .catch((e) =>
                  setMessage(
                    tell[e.message] ??
                      "다른 탭의 기기 보관 상태를 다시 확인해 주세요.",
                  ),
                );
            }}
          >
            기기 초안 버리고 현재 입력 유지
          </button>
        </>
      )}
      {(message || locallySaved) && <div className="save-status-region" role="status">
        {locallySaved && <SaveStatus kind="encrypted" />}
        {message && <p>{message}</p>}
      </div>}
      {paused && !blocked && (
        <button
          type="button"
          className="button button-outline"
          onClick={() => setTick((x) => x + 1)}
        >
          기기 보관 다시 읽고 비교
        </button>
      )}
    </aside>
  );
}
