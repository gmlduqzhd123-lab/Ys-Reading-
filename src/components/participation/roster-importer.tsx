"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { accountOperation } from "@/app/operations/actions";
import { parseRosterCsv, rosterCsv, type RosterRow } from "@/lib/roster-import";
type Credentials = { loginId: string; name: string; password: string };
type Group = { id: string; students: Credentials[]; completed: number };
function download(name: string, text: string) {
  const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function RosterImporter({
  classId,
  existing,
  onPending,
}: {
  classId: string;
  existing: string[];
  onPending?: (v: boolean) => void;
}) {
  const router = useRouter(),
    [rows, setRows] = useState<RosterRow[]>([]),
    [groups, setGroups] = useState<Group[] | null>(null),
    [busy, setBusy] = useState(false),
    [downloaded, setDownloaded] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    dirty = useRef(false);
  dirty.current = !!groups && !downloaded;
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
        if (dirty.current) {
          e.preventDefault();
          e.returnValue = "";
        }
      },
      click = (e: MouseEvent) => {
        const target =
          e.target instanceof Element ? e.target.closest("a") : null;
        if (
          dirty.current &&
          target &&
          !target.hasAttribute("download") &&
          !window.confirm(
            "완료 계정의 초기 비밀번호 안내표를 먼저 저장해 주세요. 이동할까요?",
          )
        )
          e.preventDefault();
      };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
    };
  }, []);
  const completed =
      groups?.flatMap((g) => g.students.slice(0, g.completed)) ?? [],
    total = groups?.reduce((n, g) => n + g.students.length, 0) ?? 0,
    finished = total > 0 && completed.length === total;
  return (
    <details className="panel">
      <summary>CSV 명단으로 여러 학생 준비하기</summary>
      <p>
        ‘아이디,별칭’ 두 열의 UTF-8 CSV를 선택하세요. 1~300명을 미리 확인하고
        30명씩 차례로 발급합니다. 파일의 비밀번호 열은 받지 않습니다.
      </p>
      {!groups ? (
        <>
          <button
            className="button button-outline"
            onClick={() =>
              download(
                "책숲-명단-양식.csv",
                "\uFEFF아이디,별칭\r\nbf_student01,새싹\r\nbf_student02,책나무",
              )
            }
          >
            명단 양식 받기
          </button>
          <label className="field">
            학생 명단 CSV
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={!classId || busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setRows([]);
                setMessage("");
                if (!file) return;
                setBusy(true);
                try {
                  if (file.size > 512000)
                    throw Error("파일은 500KB 이하로 준비해 주세요.");
                  setRows(parseRosterCsv(await file.text(), existing));
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "파일을 읽지 못했어요.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {!!rows.length && (
            <>
              <p>
                {rows.length}명 · 확인 필요{" "}
                {rows.filter((r) => r.errors.length).length}명 · 아직 계정은
                발급하지 않았어요.
              </p>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>CSV 행</th>
                      <th>아이디</th>
                      <th>별칭</th>
                      <th>검사</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        <td>{r.loginId}</td>
                        <td>{r.name}</td>
                        <td>{r.errors.join(" · ") || "준비 가능"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="button button-primary"
                disabled={busy || rows.some((r) => r.errors.length)}
                onClick={() => {
                  const credentials = rows.map((r) => ({
                    ...r,
                    password:
                      "Aa7!" +
                      Array.from(
                        crypto.getRandomValues(new Uint8Array(18)),
                        (v) => v.toString(16).padStart(2, "0"),
                      ).join(""),
                  }));
                  const chunks: Group[] = [];
                  for (let i = 0; i < credentials.length; i += 30)
                    chunks.push({
                      id: crypto.randomUUID(),
                      students: credentials.slice(i, i + 30),
                      completed: 0,
                    });
                  setGroups(chunks);
                  setDownloaded(false);
                  onPending?.(true);
                }}
              >
                이 명단으로 발급 준비
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <p>
            {total}명 중 {completed.length}명 완료 · 초기 비밀번호는 이 화면에만
            보관됩니다.
          </p>
          <button
            className="button button-primary"
            disabled={busy || finished}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setDownloaded(false);
              setMessage("");
              try {
                const current = groups.map((g) => ({ ...g }));
                for (const g of current) {
                  if (g.completed === g.students.length) continue;
                  const r = await accountOperation({
                    kind: "create_students",
                    requestId: g.id,
                    classroomId: classId,
                    students: g.students,
                  });
                  g.completed = Math.max(
                    g.completed,
                    Math.min(g.students.length, r.completed ?? 0),
                  );
                  setGroups(current.map((g) => ({ ...g })));
                  if (!r.ok) {
                    setMessage(r.message);
                    return;
                  }
                }
                setMessage(
                  "명단 발급을 마쳤어요. 완료 계정 안내표를 저장해 주세요.",
                );
                router.refresh();
              } catch {
                setMessage(
                  "연결을 확인한 뒤 같은 발급 버튼으로 이어가 주세요.",
                );
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            {busy
              ? "계정을 발급하고 있어요…"
              : completed.length
                ? "미완료 계정 이어서 발급"
                : "CSV 명단 계정 발급"}
          </button>
          <button
            className="button button-outline"
            disabled={busy || !completed.length}
            onClick={() => {
              download("책숲-완료계정-안내표.csv", rosterCsv(completed));
              setDownloaded(true);
            }}
          >
            완료 계정 안내표 저장 · {completed.length}명
          </button>
          <button
            className="button button-outline"
            disabled={busy || (!!completed.length && !downloaded)}
            onClick={() => {
              if (
                !finished &&
                !window.confirm(
                  "이미 발급한 계정은 유지됩니다. 미완료 명단 준비를 마칠까요?",
                )
              )
                return;
              setGroups(null);
              setRows([]);
              onPending?.(false);
              router.refresh();
            }}
          >
            명단 준비 마치기
          </button>
        </>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </details>
  );
}
