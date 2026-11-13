"use client";
import Link from "next/link";
export function WorkshopListControls({
  classroom,
  section,
  prefix,
  label,
  list,
  params,
  students,
  statuses = [],
  dates = false,
  basePath = "/classroom",
}: {
  classroom: string;
  section: string;
  prefix: string;
  label: string;
  list: { total: number; page: number; size: number };
  params: Record<string, string | undefined>;
  students?: { id: string; name: string }[];
  statuses?: string[][];
  dates?: boolean;
  basePath?: string;
}) {
  const pageHref = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    p.set("classroom", classroom);
    p.set("section", params.section === "all" ? "all" : section);
    p.set(prefix + "Page", String(page));
    return basePath + "?" + p + "#" + prefix + "-list";
  };
  return (
    <section
      className="tool-list-controls"
      id={prefix + "-list"}
      aria-label={label + " 검색·목록 이동"}
    >
      <h3>{label} 찾기</h3>
      <form
        action={basePath}
        className="tool-filter-form"
        onChange={(e) => {
          const end = e.currentTarget.elements.namedItem(
            prefix + "Until",
          ) as HTMLInputElement | null;
          end?.setCustomValidity("");
        }}
        onSubmit={(e) => {
          const start = e.currentTarget.elements.namedItem(
              prefix + "From",
            ) as HTMLInputElement | null,
            end = e.currentTarget.elements.namedItem(
              prefix + "Until",
            ) as HTMLInputElement | null;
          if (
            start?.value &&
            end?.value &&
            (start.value > end.value ||
              (Date.parse(end.value) - Date.parse(start.value)) / 86400000 >
                1096)
          ) {
            e.preventDefault();
            end.setCustomValidity(
              "시작일 이후의 종료일과 3년 이내의 기간을 선택해 주세요.",
            );
            end.reportValidity();
          }
        }}
      >
        {Object.entries(params)
          .filter(
            ([k, v]) =>
              v &&
              !k.startsWith(prefix) &&
              !["classroom", "section"].includes(k),
          )
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <input type="hidden" name="classroom" value={classroom} />
        <input
          type="hidden"
          name="section"
          value={params.section === "all" ? "all" : section}
        />
        <label className="field">
          {label} 검색어
          <input
            name={prefix + "Q"}
            maxLength={100}
            defaultValue={params[prefix + "Q"] ?? ""}
          />
        </label>
        {statuses.length > 0 && (
          <label className="field">
            {label} 상태
            <select
              aria-label={label + " 상태"}
              name={prefix + "Status"}
              defaultValue={params[prefix + "Status"] ?? "all"}
            >
              <option value="all">전체</option>
              {statuses.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        {students && (
          <label className="field">
            {label} 학생
            <select
              aria-label={label + " 학생"}
              name={prefix + "Student"}
              defaultValue={params[prefix + "Student"] ?? ""}
            >
              <option value="">모든 학생</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {dates && (
          <>
            <label className="field">
              {label} 시작일
              <input
                type="date"
                name={prefix + "From"}
                defaultValue={params[prefix + "From"] ?? ""}
              />
            </label>
            <label className="field">
              {label} 종료일
              <input
                type="date"
                name={prefix + "Until"}
                defaultValue={params[prefix + "Until"] ?? ""}
              />
            </label>
          </>
        )}
        <button className="button button-outline">{label} 검색</button>
      </form>
      <nav className="button-row" aria-label={label + " 페이지"}>
        <p>
          전체 {list.total}개 · {list.page} /{" "}
          {Math.max(1, Math.ceil(list.total / list.size))}쪽
        </p>
        {list.page > 1 && (
          <Link
            className="button button-outline"
            href={pageHref(list.page - 1)}
          >
            {label} 이전
          </Link>
        )}
        {list.page * list.size < list.total && (
          <Link
            className="button button-outline"
            href={pageHref(list.page + 1)}
          >
            {label} 다음
          </Link>
        )}
      </nav>
    </section>
  );
}
