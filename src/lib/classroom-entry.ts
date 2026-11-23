export const newClassHref = "/start?mode=new";
export const classroomLoginHref = "/login?mode=teacher&intent=classroom";
export const classroomLoginCookie = "bf_classroom_login";

// This intent can select one in-app destination. Role checks stay on the server.
export function classroomLoginDestination(intent: unknown, role?: string) {
  return intent === "classroom" && role === "teacher" ? newClassHref : null;
}
export const classroomAccountHref = "/account?intent=classroom";
export const teacherRequestCookie = (owner: string) => "bf_teacher_requested_" + owner;
