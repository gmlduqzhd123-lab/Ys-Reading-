/**
 * Operator-only account provisioning. Read a single JSON object from stdin.
 * Passwords must never be passed as shell arguments or saved in the repository.
 * Run: node --env-file=.env.local --import tsx scripts/provision-user.ts
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const schema = z.object({
  role: z.enum(["teacher", "student"]),
  displayName: z.string().trim().min(1).max(40),
  email: z.email().optional(),
  loginId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/).optional(),
  password: z.string().min(12).max(128),
  classroomId: z.string().uuid().optional(),
  testFixture: z.boolean().default(false),
}).strict();

async function readInput() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 10000) throw new Error("INPUT_TOO_LARGE");
  }
  return schema.parse(JSON.parse(input));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("MISSING_SERVER_CONFIGURATION");
  const input = await readInput();
  if (input.role === "teacher" && !input.email) throw new Error("TEACHER_EMAIL_REQUIRED");
  if (input.role === "student" && !input.loginId) throw new Error("STUDENT_LOGIN_ID_REQUIRED");
  if (input.testFixture && (process.env.BOOKFOREST_ALLOW_TEST_FIXTURES !== "true" || !input.displayName.startsWith("테스트"))) {
    throw new Error("TEST_FIXTURES_REQUIRE_DEVELOPMENT_OPT_IN_AND_TEST_NAME");
  }
  const email = input.role === "student" ? `${input.loginId!.toLowerCase()}@students.bookforest.invalid` : input.email!;
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (input.classroomId) {
    const { data, error } = await supabase.from("classrooms").select("id").eq("id", input.classroomId).single();
    if (error || !data) throw new Error("CLASSROOM_NOT_FOUND");
  }
  const { data, error } = await supabase.auth.admin.createUser({ email, password: input.password, email_confirm: true });
  if (error || !data.user) throw new Error("AUTH_USER_CREATION_FAILED_CHECK_ACCOUNT_AND_PASSWORD_POLICY");
  const id = data.user.id;
  try {
    // The Auth trigger creates an unprivileged pending profile first. Only this
    // explicit operator path can assign an adult role or a development fixture.
    const { error: profileError } = await supabase.from("profiles").upsert({
      id, display_name: input.displayName, role: input.role,
      consent_status: input.role === "student" && input.testFixture ? "verified" : "pending",
    }, { onConflict: "id" });
    if (profileError) throw new Error("PROFILE_CREATION_FAILED");
    if (input.role === "student" && input.classroomId) {
      const { error: enrollmentError } = await supabase.from("enrollments").insert({
        classroom_id: input.classroomId, student_id: id, active: true,
      });
      if (enrollmentError) throw new Error("ENROLLMENT_CREATION_FAILED");
    }
  } catch (error) {
    const cleanup = await supabase.auth.admin.deleteUser(id);
    if (cleanup.error) throw new Error("ACCOUNT_SETUP_FAILED_MANUAL_ORPHAN_CLEANUP_REQUIRED");
    throw error;
  }
  process.stdout.write(JSON.stringify({ ok: true, userId: id, role: input.role, testFixture: input.testFixture }) + "\n");
}

main().catch((error: unknown) => {
  const code = error instanceof z.ZodError ? "INVALID_ACCOUNT_INPUT" : error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "ACCOUNT_PROVISIONING_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
