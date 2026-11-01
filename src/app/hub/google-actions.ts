"use server";
import { requireProfile } from "@/lib/auth";
import { verifyGoogleConnection } from "@/lib/google-drive";
import { googleExportFailure } from "@/lib/google-errors";
import { revalidatePath } from "next/cache";
export async function checkGoogleConnection() {
  try {
    const p = await requireProfile();
    if (p.role !== "teacher")
      return { ok: false, message: "선생님 계정에서 연결을 확인해 주세요." };
    const r = await verifyGoogleConnection(p.id);
    revalidatePath("/hub");
    return {
      ok: true,
      message: "Google Drive에 실제 요청을 보내 연결을 확인했어요.",
      checkedAt: r.checkedAt,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        googleExportFailure(error)?.body.error ??
        "Google 연결을 확인하지 못했어요. 로그인과 연결 상태를 확인해 주세요.",
    };
  }
}
