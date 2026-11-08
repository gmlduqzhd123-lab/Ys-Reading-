"use server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { operationsError } from "@/lib/operations";
import { revalidatePath } from "next/cache";
export async function saveRecoveryCheck(input: unknown) {
  try {
    const v = z
      .object({
        target: z.string().regex(/^[a-z0-9]{20}$/),
        steps: z
          .object({
            backup: z.boolean(),
            database: z.boolean(),
            authentication: z.boolean(),
            mfa: z.boolean(),
            permissions: z.boolean(),
            privacy: z.boolean(),
            worker: z.boolean(),
            google: z.boolean(),
          })
          .strict(),
        id: z.uuid().nullable(),
        revision: z.number().int().min(0),
        request: z.uuid(),
      })
      .strict()
      .parse(input);
    const p = await requireProfile();
    if (!p.operator) throw Error("BF_FORBIDDEN");
    const c = await createClient();
    const r = await c.rpc("operator_recovery_check", {
      p_target: v.target,
      p_steps: v.steps,
      p_id: v.id,
      p_revision: v.revision,
      p_request: v.request,
    });
    if (r.error) throw r.error;
    revalidatePath("/status");
    return {
      ok: true,
      message:
        "본인이 확인한 복구 훈련 이력을 저장했어요. 실제 서버 전환을 자동으로 수행하지 않습니다.",
    };
  } catch (e) {
    return { ok: false, message: operationsError(e) };
  }
}
