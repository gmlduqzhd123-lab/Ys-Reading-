"use server";

import { z } from "zod";
import { accountReady } from "@/lib/account-access";
import { getCurrentProfile } from "@/lib/auth";
import { readExportRecords } from "@/lib/export-records";
import { readExportSelection } from "@/lib/export-selection";

export async function restoreExportSelection(owner: string, classroom: string, raw: string) {
  const profile = await getCurrentProfile();
  if (!accountReady(profile) || profile.role !== "teacher" || profile.id !== owner)
    return { status: "unavailable" } as const;
  if (classroom && !z.uuid().safeParse(classroom).success) return null;
  const saved = readExportSelection(raw, Date.now());
  if (!saved) return null;
  const ids = [...new Set(saved.ids)];
  const titles = new Map<string, string>();
  if (ids.length) {
    const result = await readExportRecords<{ id: string; title: string }>(
      saved.kind, ids, profile, classroom || undefined,
      saved.kind === "reading" ? "id,title:book->>title" : "id,title",
    );
    if (result.error) return { status: "unavailable" } as const;
    for (const row of result.data ?? []) titles.set(row.id, row.title);
  }
  const records = ids.filter(id => titles.has(id)).map(id => ({ id, title: titles.get(id)! }));
  return {
    status: "restored", kind: saved.kind, title: saved.title, records,
    omitted: records.length !== saved.ids.length,
  } as const;
}
