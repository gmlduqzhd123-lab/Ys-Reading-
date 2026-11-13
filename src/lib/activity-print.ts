import type { ClassActivity } from "./classroom-tools";
const escape = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function activityPrint(
  activity: ClassActivity,
  answers?: Record<string, string | number>,
) {
  const s = activity.snapshot;
  return (
    '<!doctype html><html lang="ko"><meta charset="utf-8"><title>' +
    escape(s.title) +
    '</title><style>@page{size:A4;margin:18mm}body{font:12pt/1.8 "Malgun Gothic",sans-serif;color:#253c31}section{break-inside:avoid;margin:16px 0}p{white-space:pre-wrap;overflow-wrap:anywhere}.space{height:90px;border-bottom:1px solid #aaa}@media print{button{display:none}}</style><button onclick="window.print()">인쇄 · PDF 저장</button><h1>' +
    escape(s.title) +
    "</h1><p>책숲 · 배부 버전 " +
    escape(s.revision) +
    " · 이름 __________</p><p>" +
    escape(s.instructions) +
    "</p>" +
    s.questions
      .map(
        (q, i) =>
          "<section><h2>" +
          (i + 1) +
          ". " +
          escape(q.label) +
          "</h2>" +
          (q.options
            ? "<ol>" +
              q.options.map((v) => "<li>" + escape(v) + "</li>").join("") +
              "</ol>"
            : "") +
          (answers
            ? "<p>" +
              escape(
                typeof answers[q.id] === "number"
                  ? q.options?.[Number(answers[q.id])]
                  : answers[q.id],
              ) +
              "</p>"
            : '<div class="space"></div>') +
          "</section>",
      )
      .join("") +
    "</html>"
  );
}
export function downloadActivity(
  activity: ClassActivity,
  answers?: Record<string, string | number>,
) {
  const url = URL.createObjectURL(
      new Blob([activityPrint(activity, answers)], {
        type: "text/html;charset=utf-8",
      }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = answers ? "책숲-활동-제출본.html" : "책숲-활동지.html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
