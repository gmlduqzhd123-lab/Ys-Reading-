import { describe, expect, it } from "vitest";
import { classroomStudents } from "@/lib/classroom-roster";
describe("화폐 지급 대상 학급", () => {
  const students = [
    { id: "a", role: "student" }, { id: "b", role: "student" },
    { id: "c", role: "student" }, { id: "suspended", role: "student", account_active: false },
    { id: "teacher", role: "teacher" },
  ];
  const enrollments = [
    { classroom_id: "one", student_id: "a", active: true },
    { classroom_id: "two", student_id: "b", active: true },
    { classroom_id: "one", student_id: "c", active: false },
    { classroom_id: "one", student_id: "suspended", active: true },
    { classroom_id: "one", student_id: "teacher", active: true },
  ];
  it("다른 반·활동 중지·정지 계정과 교사를 제외한다", () => {
    expect(classroomStudents(students, enrollments, "one").map((s) => s.id)).toEqual(["a"]);
    expect(classroomStudents(students, enrollments, "two").map((s) => s.id)).toEqual(["b"]);
  });
  it("없는 학급이나 빈 명단은 지급 대상을 만들지 않는다", () => {
    expect(classroomStudents(students, enrollments, "unknown")).toEqual([]);
    expect(classroomStudents(students, [], "one")).toEqual([]);
  });
});
