// Pure worker: provider calls are injectable so retries and partial failures can be tested.
export type AccountKind =
  | "create_students"
  | "reset_password"
  | "change_password"
  | "delete_account";
export interface AccountInput {
  kind: AccountKind;
  requestId: string;
  classroomId?: string;
  studentId?: string;
  id?: string;
  students?: { loginId: string; name: string; password: string }[];
  password?: string;
  currentPassword?: string;
}
export interface Job {
  id: string;
  lease: string;
  kind: AccountKind;
  done: boolean;
  plan: {
    items: { id: string; loginId?: string; name?: string }[];
    deletionId?: string;
  };
  results: Record<string, string>;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const strong = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length >= 12 &&
  v.length <= 128 &&
  /[a-z]/.test(v) &&
  /[A-Z]/.test(v) &&
  /[0-9]/.test(v);
export function parseAccountInput(value: unknown): AccountInput {
  if (!value || typeof value !== "object") throw new Error("BF_INVALID_INPUT");
  const v = value as AccountInput;
  if (
    !uuid.test(v.requestId ?? "") ||
    ![
      "create_students",
      "reset_password",
      "change_password",
      "delete_account",
    ].includes(v.kind)
  )
    throw new Error("BF_INVALID_INPUT");
  if (v.kind === "create_students") {
    if (
      !uuid.test(v.classroomId ?? "") ||
      !Array.isArray(v.students) ||
      v.students.length < 1 ||
      v.students.length > 30
    )
      throw new Error("BF_INVALID_INPUT");
    const seen = new Set<string>();
    for (const s of v.students) {
      if (
        !s ||
        !/^[a-z0-9][a-z0-9_-]{3,31}$/.test(s.loginId ?? "") ||
        typeof s.name !== "string" ||
        !s.name.trim() ||
        s.name.length > 40 ||
        !strong(s.password) ||
        seen.has(s.loginId)
      )
        throw new Error("BF_INVALID_INPUT");
      seen.add(s.loginId);
    }
    return {
      kind: v.kind,
      requestId: v.requestId,
      classroomId: v.classroomId,
      students: v.students.map((s) => ({
        loginId: s.loginId,
        name: s.name.trim(),
        password: s.password,
      })),
    };
  }
  if (v.kind === "delete_account") {
    if (!uuid.test(v.id ?? "")) throw new Error("BF_INVALID_INPUT");
    return { kind: v.kind, requestId: v.requestId, id: v.id };
  }
  if (!strong(v.password)) throw new Error("BF_PASSWORD_WEAK");
  if (v.kind === "reset_password") {
    if (!uuid.test(v.classroomId ?? "") || !uuid.test(v.studentId ?? ""))
      throw new Error("BF_INVALID_INPUT");
    return {
      kind: v.kind,
      requestId: v.requestId,
      classroomId: v.classroomId,
      studentId: v.studentId,
      password: v.password,
    };
  }
  if (
    typeof v.currentPassword !== "string" ||
    !v.currentPassword ||
    v.currentPassword.length > 256 ||
    v.currentPassword === v.password
  )
    throw new Error("BF_PASSWORD_DIFFERENT");
  return {
    kind: v.kind,
    requestId: v.requestId,
    password: v.password,
    currentPassword: v.currentPassword,
  };
}
export function safePlan(input: AccountInput) {
  if (input.kind === "create_students")
    return {
      classroomId: input.classroomId,
      students: input.students!.map(({ loginId, name }) => ({ loginId, name })),
    };
  if (input.kind === "delete_account") return { id: input.id };
  if (input.kind === "reset_password")
    return { classroomId: input.classroomId, studentId: input.studentId };
  return {};
}
export interface AccountProvider {
  create(
    id: string,
    email: string,
    password: string,
    jobId: string,
  ): Promise<void>;
  password(id: string, password: string): Promise<void>;
  purge(id: string): Promise<{ scope: string; studentId: string }>;
  remove(id: string): Promise<void>;
  finish(job: Job, index: number, success: boolean): Promise<Job>;
}
export async function runAccountJob(
  input: AccountInput,
  initial: Job,
  provider: AccountProvider,
) {
  let job = initial;
  if (job.done)
    return {
      ok: true,
      completed: job.plan.items.length,
      total: job.plan.items.length,
    };
  for (let i = 0; i < job.plan.items.length; i++) {
    if (job.results[String(i)] === "done") continue;
    const item = job.plan.items[i];
    try {
      if (input.kind === "create_students") {
        const student = input.students?.[i];
        if (!student || student.loginId !== item.loginId)
          throw new Error("BF_IDEMPOTENCY_CONFLICT");
        await provider.create(
          item.id,
          `${student.loginId}@students.bookforest.invalid`,
          student.password,
          job.id,
        );
      } else if (input.kind === "delete_account") {
        const deletion = await provider.purge(job.plan.deletionId!);
        if (deletion.studentId !== item.id) throw new Error("BF_FORBIDDEN");
        if (deletion.scope === "account") await provider.remove(item.id);
      } else await provider.password(item.id, input.password!);
      job = await provider.finish(job, i, true);
    } catch {
      // Never return provider error bodies: they may contain identifiers or credentials.
      try {
        await provider.finish(job, i, false);
      } catch {
        /* a stale lease must not be replaced */
      }
      return {
        ok: false,
        completed: Object.values(job.results).filter((v) => v === "done")
          .length,
        total: job.plan.items.length,
      };
    }
  }
  return {
    ok: job.done,
    completed: Object.values(job.results).filter((v) => v === "done").length,
    total: job.plan.items.length,
  };
}
