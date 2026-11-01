export interface TodayState {
  asOf: string;
  page: number;
  total: number;
  pendingClasses: number;
  tasks: {
    id: string;
    classroom_id: string;
    mission_snapshot: { title: string };
    due_at: string | null;
    state: string;
    version: number | null;
  }[];
}
export interface ReviewState {
  asOf: string;
  classroom: string | null;
  kind: "reading" | "writing";
  page: number;
  total: number;
  totals: { writing: number; reading: number; revision: number };
  rows: {
    id: string;
    classroom_id: string;
    student_id: string;
    student_name: string;
    kind: string;
    title: string;
    body: string;
    version: number;
    created_at: string;
  }[];
  presets: { id: string; title: string; body: string }[];
}
