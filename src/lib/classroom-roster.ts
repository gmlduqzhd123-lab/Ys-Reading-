// A display filter only; every payment still checks membership in the database.
export function classroomStudents<T extends { id: string; role: string; account_active?: boolean }>(
  students: T[],
  enrollments: { classroom_id: string; student_id: string; active?: unknown }[],
  classroomId: string,
): T[] {
  const members = new Set(enrollments
    .filter((e) => e.classroom_id === classroomId && e.active === true)
    .map((e) => e.student_id));
  return students.filter((s) => s.role === "student" && s.account_active !== false && members.has(s.id));
}
