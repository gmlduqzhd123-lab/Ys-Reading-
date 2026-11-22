import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  machineTransport,
  machineTokenHash,
  newMachineToken,
  rotateMachineCredential,
} from "../scripts/lib/backup-machine.mjs";
const c = {
  projectRef: "rbtqtkjnqtcnljvabisa",
  url: "https://rbtqtkjnqtcnljvabisa.supabase.co",
  id: "11111111-1111-4111-8111-111111111111",
  apiKey: "public-fixture",
  token: "bfm1_" + "a".repeat(64),
};
it("uses a project-only RPC without OAuth, arbitrary SQL or credential-bearing redirects", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ protocol: 1, projectRef: c.projectRef, mode: "machine" }),
    );
  const m = machineTransport(c, { fetcher });
  expect(await m.call("get_project_url")).toEqual({ url: c.url });
  expect(fetcher.mock.calls[0][0]).toBe(
    c.url + "/rest/v1/rpc/backup_machine_request",
  );
  expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  await expect(m.call("execute_sql")).rejects.toThrow(
    "BACKUP_OPERATION_FORBIDDEN",
  );
  await expect(m.request("delete-users")).rejects.toThrow(
    "BACKUP_OPERATION_FORBIDDEN",
  );
  expect(() =>
    machineTransport({ ...c, url: "https://foreign.supabase.co" }),
  ).toThrow("BACKUP_CREDENTIAL_INVALID");
});
it("does not retry permission denial or expose provider diagnostics, and bounds transient retries", async () => {
  const denied = vi
    .fn()
    .mockResolvedValue(new Response("private upstream text", { status: 403 }));
  await expect(
    machineTransport(c, { fetcher: denied }).request("health"),
  ).rejects.toThrow("BACKUP_PERMISSION_DENIED");
  expect(denied).toHaveBeenCalledOnce();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(Response.json({ accepted: true }));
  expect(
    await machineTransport(c, { fetcher, sleep: async () => {} }).request(
      "receipt",
      { id: "stable-request" },
    ),
  ).toEqual({ accepted: true });
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
});
it("generates high entropy independent credentials and removes MCP imports from automatic jobs", () => {
  const a = newMachineToken(),
    b = newMachineToken();
  expect(a).toMatch(/^bfm1_[a-f0-9]{64}$/);
  expect(a).not.toBe(b);
  expect(machineTokenHash(a)).toMatch(/^[a-f0-9]{64}$/);
  for (const file of [
    "operator-backup",
    "operator-cloud-backup",
    "operator-check-copy",
    "operator-scheduled",
    "operator-watchdog",
  ]) {
    const source = readFileSync("scripts/" + file + ".mjs", "utf8");
    expect(source).toContain("backup-machine.mjs");
    expect(source).not.toMatch(
      /from ["']\.\/lib\/(?:native-mcp|operator-transport)\.mjs/,
    );
  }
  expect(readFileSync("scripts/lib/backup-machine.mjs", "utf8")).not.toContain(
    "native-mcp",
  );
});
it("persists a pending replacement before rotation and recovers a lost rotation response on the next open", async () => {
  let stored: any,
    current = c.token;
  const save = async (v: any) => {
    stored = structuredClone(v);
  };
  const fetcher = vi.fn(async (_url: any, o: any) => {
    const v = JSON.parse(o.body);
    if (v.p_operation === "rotate" && v.p_token === current) {
      expect(stored.pendingToken).toBeTruthy();
      current = stored.pendingToken;
      throw Error("lost response");
    }
    if (v.p_operation === "health" && v.p_token === current)
      return Response.json({
        protocol: 1,
        projectRef: c.projectRef,
        mode: "machine",
      });
    return new Response("", { status: 403 });
  });
  await expect(
    rotateMachineCredential(
      { ...c, rotatedAt: "2026-01-01" },
      { save, fetcher, force: true },
    ),
  ).rejects.toThrow("BACKUP_PERMISSION_DENIED");
  expect(stored.token).toBe(c.token);
  expect(stored.pendingToken).toBe(current);
  const recovered = await rotateMachineCredential(stored, { save, fetcher });
  expect(recovered.token).toBe(current);
  expect(recovered.pendingToken).toBeUndefined();
});
it("rotates an old key automatically and never rewrites a healthy fresh credential", async () => {
  const save = vi.fn(),
    fetcher = vi.fn().mockResolvedValue(Response.json({ rotated: true }));
  const old = { ...c, rotatedAt: "2026-01-01" };
  const next = await rotateMachineCredential(old, {
    save,
    fetcher,
    now: Date.parse("2026-02-15"),
  });
  expect(next.token).not.toBe(c.token);
  expect(save).toHaveBeenCalledTimes(2);
  fetcher.mockClear();
  await rotateMachineCredential(next, {
    save,
    fetcher,
    now: Date.parse("2026-02-16"),
  });
  expect(fetcher).not.toHaveBeenCalled();
});
