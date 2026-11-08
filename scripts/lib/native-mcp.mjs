import { spawn } from "node:child_process";
import readline from "node:readline";
import { existsSync } from "node:fs";
import { resolveBackupCodex } from "./backup-runtime.mjs";
// Native project-scoped MCP credentials stay in Codex. Never print tool payloads.
export async function nativeMcp() {
  const binary = process.env.BOOKFOREST_CODEX_BINARY || (process.platform === "win32" ? resolveBackupCodex() : "codex");
  if (process.env.BOOKFOREST_CODEX_BINARY && !existsSync(binary))
    throw Error("BACKUP_CODEX_UNAVAILABLE");
  const child = spawn(binary, ["app-server"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let sequence = 0;
  let startupFailure;
  const pending = new Map();
  child.once("error", () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("MCP_UNAVAILABLE"));
    }
    pending.clear();
  });
  child.stderr.on("data", () => {});
  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    const failure = startupErrorCode(m);
    if (failure) startupFailure = failure;
    if (m.method && m.id !== undefined) {
      child.stdin.write(
        JSON.stringify({
          id: m.id,
          error: {
            code: -32601,
            message: "Interactive authentication belongs in Codex",
          },
        }) + "\n",
      );
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    if (m.error) p.reject(Error(startupFailure || mcpErrorCode(m.error)));
    else p.resolve(m.result);
  });
  function request(method, params) {
    return new Promise((resolve, reject) => {
      if (startupFailure && method === "mcpServer/tool/call") {
        reject(Error(startupFailure));
        return;
      }
      const id = ++sequence,
        timer = setTimeout(() => {
          pending.delete(id);
          reject(Error("MCP_TIMEOUT"));
        }, 55000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  const close = () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("MCP_CLOSED"));
    }
    pending.clear();
    lines.close();
    child.stdin.end();
    child.kill();
  };
  try {
    await request("initialize", {
      clientInfo: { name: "bookforest-operator-backup", version: "1.0" },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    const context = await request("thread/start", { ephemeral: true });
    return {
      call: async (tool, args) =>
        parseToolResult(
          await request("mcpServer/tool/call", {
            threadId: context.thread.id,
            server: "supabase",
            tool,
            arguments: args,
          }),
        ),
      close,
    };
  } catch (error) {
    close();
    throw Error(
      /^MCP_[A-Z_]+$/.test(error?.message ?? "")
        ? error.message
        : "MCP_UNAVAILABLE",
    );
  }
}
export function startupErrorCode(notification) {
  const p = notification?.params;
  return notification?.method === "mcpServer/startupStatus/updated" &&
    p?.name === "supabase" && p?.status === "failed" &&
    p?.failureReason === "reauthenticationRequired"
    ? "MCP_AUTH_REQUIRED" : null;
}
// Raw provider errors can contain credentials or SQL contents. Return only a
// bounded classification, including the OAuth refresh failure seen by the task.
export function mcpErrorCode(error, fallback = "MCP_REQUEST_FAILED") {
  const message =
    typeof error === "string" ? error : String(error?.message ?? "");
  return error?.code === 401 ||
    /oauth[^\n]{0,100}(refresh|expired|invalid)|token[^\n]{0,50}(refresh|expired)|refresh[^\n]{0,50}(token|oauth)|invalid_grant|not authenticated|not logged in|authentication required|unauthorized/i.test(
      message,
    )
    ? "MCP_AUTH_REQUIRED"
    : fallback;
}
function checkedResult(value) {
  if (value === undefined || value === null)
    throw Error("MCP_RESPONSE_INVALID");
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value.isError === true || value.error)
  ) {
    const error = value.error ?? {
      message: (value.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n"),
    };
    throw Error(mcpErrorCode(error, "MCP_TOOL_FAILED"));
  }
  return value;
}
export function parseToolResult(top) {
  checkedResult(top);
  let d = top.structuredContent;
  if (!d)
    for (const c of top.content ?? []) {
      try {
        d = JSON.parse(c.text);
        break;
      } catch {}
    }
  checkedResult(d);
  if (typeof d === "object" && "result" in d) d = checkedResult(d.result);
  if (typeof d !== "string") return checkedResult(d);
  let parsed;
  try {
    parsed = JSON.parse(d);
  } catch {}
  if (parsed !== undefined) return checkedResult(parsed);
  for (const tag of d.matchAll(/<untrusted-data-[a-z0-9-]+>/g)) {
    const end = d.indexOf("</untrusted-data-", tag.index);
    if (end < 0) continue;
    const body = d.slice(tag.index + tag[0].length, end).trim();
    for (const candidate of [
      body,
      body.replace(/^(?:\\n|\s)+|(?:\\n|\s)+$/g, ""),
      body.replace(/\\n/g, "\n").replace(/\\"/g, '"').trim(),
    ]) {
      let decoded;
      try {
        decoded = JSON.parse(candidate);
      } catch {
        continue;
      }
      return checkedResult(decoded);
    }
  }
  throw Error("MCP_RESPONSE_INVALID");
}
