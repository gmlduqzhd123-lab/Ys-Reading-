"use server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { operationsError } from "@/lib/operations";
import { parseAccountInput } from "../../../supabase/functions/_shared/account-worker";
import { revalidatePath } from "next/cache";

export async function operationsCommand(
  command: string,
  payload: Record<string, unknown>,
  requestId: string,
) {
  try {
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new Error("BF_UNAUTHENTICATED");
    const { data, error } = await client.rpc("operations_command", {
      p_command: command,
      p_payload: payload,
      p_request_id: requestId,
    });
    if (error) throw error;
    revalidatePath("/operations");
    revalidatePath("/account");
    revalidatePath("/hub");
    revalidatePath("/app");
    return { ok: true, message: "처리했습니다.", data };
  } catch (error) {
    return { ok: false, message: operationsError(error), data: null };
  }
}
export async function accountOperation(value: unknown) {
  try {
    const input = parseAccountInput(value);
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new Error("BF_UNAUTHENTICATED");
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) throw new Error("BF_UNAUTHENTICATED");
    const config = getSupabaseConfig()!;
    const response = await fetch(
      `${config.url}/functions/v1/account-operations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: config.key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(55000),
      },
    );
    const result = await response.json();
    revalidatePath("/operations");
    revalidatePath("/account");
    if (result.ok) {
      if (input.kind === "change_password") await client.auth.signOut();
      return {
        ok: true,
        message:
          input.kind === "change_password"
            ? "비밀번호를 바꿨어요. 새 비밀번호로 다시 로그인해 주세요."
            : "처리를 완료했습니다.",
        completed: Number(result.completed ?? 1),
      };
    }
    return {
      ok: false,
      message: result.code
        ? operationsError(new Error(result.code))
        : `${Number(result.completed ?? 0)}/${Number(result.total ?? 1)}건 완료. 같은 입력으로 다시 시도하면 완료한 계정은 건너뜁니다.`,
      completed: Number(result.completed ?? 0),
    };
  } catch (error) {
    return { ok: false, message: operationsError(error), completed: 0 };
  }
}
export async function deletionPreview(id: string) {
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("deletion_preview", { p_id: id });
    if (error) throw error;
    return {
      ok: true,
      data: data as {
        reading_logs: number;
        submissions: number;
        plaza_posts: number;
        ledger: number;
        auth_account: boolean;
        retention_eligible: boolean;
      },
      message: "",
    };
  } catch (error) {
    return { ok: false, data: null, message: operationsError(error) };
  }
}
