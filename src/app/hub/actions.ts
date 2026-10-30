"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { commandSchema, readingSchema, hubError } from "@/lib/hub";
import type { ActionResult } from "@/app/actions";

export async function hubCommand(
  input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const value = commandSchema.parse(input);
    await requireProfile();
    if (value.command === "reading_save")
      value.payload = readingSchema.parse(value.payload);
    const client = await createClient();
    const { data, error } = await client.rpc("hub_command", {
      p_command: value.command,
      p_payload: value.payload,
      p_request_id: value.requestId,
    });
    if (error) throw error;
    if (!data) throw new Error("Empty result");
    revalidatePath("/hub");
    revalidatePath("/app", "layout");
    return {
      ok: true,
      message: "처리했어요. 최신 기록에 반영되었습니다.",
      data,
    };
  } catch (error) {
    return { ok: false, message: hubError(error) };
  }
}
