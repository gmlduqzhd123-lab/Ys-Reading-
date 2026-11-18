export function weekStart(value?: string, now = Date.now()) {
  const day = value ?? new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("WEEK_INVALID");
  const date = new Date(day + "T00:00:00Z");
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== day)
    throw Error("WEEK_INVALID");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export interface WeeklySummary {
  from: string;
  until: string;
  eligibleStudents: number;
  days: { day: string; reading: number; writing: number; feedback: number }[];
  totals: {
    reading: number;
    writing: number;
    revision: number;
    feedback: number;
    participants: number;
  };
  previous: { reading: number; writing: number };
  pendingCount: number;
  pending: {
    id: string;
    student_id: string;
    classroom_id: string;
    display_name: string;
    created_at: string;
  }[];
}
