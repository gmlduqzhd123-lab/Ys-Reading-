import type { ExportBundle } from "./export-documents";
export interface ReportSnapshot {
  asOf: string;
  student: { id: string; name: string };
  classroom: {
    id: string;
    name: string;
    year: number | null;
    semester: number | null;
  };
  from: string | null;
  until: string | null;
  counts: {
    readingLogs: number;
    completedBooks: number;
    completedMissions: number;
    resubmissions: number;
    feedback: number;
    xp: number;
    attendanceDays: number;
  };
  badges: { code: string; period_key: string; evidence_count: number }[];
  works: {
    id: string;
    title: string;
    body: string;
    version: number;
    created_at: string;
    firstTitle?: string;
    firstBody?: string;
    firstDate?: string;
  }[];
}
export interface GrowthReport {
  id: string;
  title: string;
  teacher_note: string;
  version: number;
  published_at: string | null;
  created_at: string;
  snapshot: ReportSnapshot;
}
export interface ReportState extends ReportSnapshot {
  page: number;
  candidateTotal: number;
  latestVersion: number;
}
export const reportCounts: Record<keyof ReportSnapshot["counts"], string> = {
  readingLogs: "남긴 독서 기록",
  completedBooks: "완독 표시한 책",
  completedMissions: "완료한 글쓰기 미션",
  resubmissions: "다시 제출한 횟수",
  feedback: "받은 피드백",
  xp: "학급 활동 경험치",
  attendanceDays: "책숲 출석 활동일",
};
export function reportBundle(report: GrowthReport): ExportBundle {
  const s = report.snapshot;
  return {
    title: report.title,
    entries: [
      {
        title: s.student.name + "의 활동 기록",
        meta: `${s.classroom.name} · ${s.classroom.year ?? "학년도 미설정"}${s.classroom.semester ? "학년도 " + s.classroom.semester + "학기" : ""} · 보고서 ${report.version}판`,
        body: [
          s.from ? `${s.from} ~ ${s.until}` : "이 학급의 전체 기간",
          ...Object.entries(reportCounts).map(
            ([key, label]) =>
              `${label}: ${s.counts[key as keyof typeof s.counts]}`,
          ),
          "책 수는 ISBN 또는 제목·저자 기준입니다. 출석은 책숲 활동 기준이며 학교 출결과 다릅니다. 다시 제출한 횟수는 수정 실력이나 성적을 평가한 값이 아닙니다.",
        ].join("\n"),
      },
      {
        title: "선생님의 관찰과 응원",
        meta: "선생님이 원본을 확인하고 작성한 의견",
        body: report.teacher_note || "별도 의견 없음",
      },
      ...s.works.flatMap((w) => {
        const final = {
          title: w.title,
          meta: `선생님이 선택한 대표 작품 · ${w.version}번째 글`,
          body: w.body,
        };
        return w.version > 1 && w.firstBody !== undefined
          ? [
              {
                title: w.firstTitle || "처음 제출한 글",
                meta: "같은 미션에서 처음 제출한 글 · 수정 과정 비교 자료",
                body: w.firstBody,
              },
              final,
            ]
          : [final];
      }),
    ],
  };
}
