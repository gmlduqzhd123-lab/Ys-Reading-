"use server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { draftScopes, workshopDraftPayloads } from "@/lib/workshop-operations";
import type { DraftReply } from "@/lib/teacher-draft";
export async function workshopDraftAction(
  owner: string,
  input: unknown,
): Promise<DraftReply> {
  try {
    const p = await requireProfile();
    if (p.id !== z.uuid().parse(owner)) throw Error("BF_FORBIDDEN");
    const v = z
      .object({
        action: z.enum(["get", "save", "discard"]),
        scope: z.enum(draftScopes),
        context: z
          .object({
            classroom: z.uuid(),
            activity: z.uuid().optional(),
            answer: z.uuid().optional(),
            version: z.number().int().min(0).optional(),
          })
          .strict(),
        payload: z.record(z.string(), z.unknown()).nullable().default(null),
        revision: z.number().int().min(0).default(0),
        request: z.uuid().nullable().default(null),
      })
      .strict()
      .parse(input);
    const payload =
      v.action === "save"
        ? workshopDraftPayloads[v.scope].parse(v.payload)
        : null;
    const c = await createClient(),
      r = await c.rpc("classroom_work_draft", {
        p_action: v.action,
        p_scope: v.scope,
        p_context: v.context,
        p_payload: payload,
        p_revision: v.revision,
        p_request: v.request,
      });
    if (r.error) throw r.error;
    return { ok: true, ...r.data };
  } catch (e) {
    const m = String(
        e && typeof e === "object" && "message" in e ? e.message : e,
      ),
      stale = /STALE/.test(m),
      retry = /fetch failed|network|timeout|PGRST00|08006|53300/i.test(m);
    return {
      ok: false,
      code: stale ? "STALE" : retry ? "RETRY" : "FORBIDDEN",
      message: stale
        ? "다른 화면의 초안과 현재 입력을 비교한 뒤 선택해 주세요."
        : retry
          ? "연결을 확인하고 같은 요청으로 다시 저장할게요."
          : "현재 계정·학급·활동의 초안 권한과 입력을 확인해 주세요.",
    };
  }
}
export async function workshopSearch(input: unknown) {
  const p = await requireProfile();
  const v = z
    .object({
      owner: z.uuid(),
      classroom: z.uuid(),
      kind: z.enum([
        "shares",
        "reports",
        "answers",
        "evidence",
        "activities",
        "library",
        "templates",
      ]),
      page: z.number().int().min(1).max(10000),
      filters: z
        .object({
          q: z.string().max(100).optional(),
          status: z.string().max(30).optional(),
          student: z.union([z.uuid(), z.literal("")]).optional(),
          activity: z.union([z.uuid(), z.literal("")]).optional(),
          from: z.union([z.iso.date(), z.literal("")]).optional(),
          until: z.union([z.iso.date(), z.literal("")]).optional(),
        })
        .strict(),
    })
    .strict()
    .parse(input);
  if (p.id !== v.owner) throw Error("BF_ACCOUNT_CHANGED");
  const c = await createClient(),
    r = await c.rpc("classroom_workshop_query", {
      p_classroom: v.classroom,
      p_kind: v.kind,
      p_page: v.page,
      p_filters: v.filters,
    });
  if (r.error) throw Error("QUERY_UNAVAILABLE");
  return r.data;
}
