import { expect, it } from "vitest";
import { mcpErrorCode, parseToolResult } from "../scripts/lib/native-mcp.mjs";

it("classifies the observed OAuth startup failure without exposing its provider text", () => {
  const message =
    "Failed to get client: MCP startup failed: OAuth token refresh failed: sensitive-provider-detail";
  expect(mcpErrorCode({ code: -32603, message })).toBe("MCP_AUTH_REQUIRED");
  expect(mcpErrorCode({ code: 401 })).toBe("MCP_AUTH_REQUIRED");
  expect(mcpErrorCode({ code: -32602, message: "Invalid params" })).toBe(
    "MCP_REQUEST_FAILED",
  );
  expect(
    mcpErrorCode({ code: 403, message: "Database permission denied" }),
  ).toBe("BACKUP_PERMISSION_DENIED");
});

it("rejects tool-level errors, including OAuth errors returned as MCP content", () => {
  expect(() =>
    parseToolResult({
      isError: true,
      content: [
        { type: "text", text: "OAuth token refresh failed: sensitive detail" },
      ],
    }),
  ).toThrow("MCP_AUTH_REQUIRED");
  expect(() =>
    parseToolResult({
      isError: true,
      content: [
        { type: "text", text: "SQL failed with confidential record contents" },
      ],
    }),
  ).toThrow("MCP_TOOL_FAILED");
});

it("rejects structured and encoded failures instead of accepting false success receipts", () => {
  for (const response of [
    { structuredContent: { error: { message: "Query failed" } } },
    { structuredContent: { result: { error: "Query failed" } } },
    { structuredContent: JSON.stringify({ error: "Query failed" }) },
    {
      content: [
        {
          type: "text",
          text: JSON.stringify({ result: { isError: true, content: [] } }),
        },
      ],
    },
  ])
    expect(() => parseToolResult(response)).toThrow("MCP_TOOL_FAILED");
});

it("accepts empty SQL results and successful scoped project responses", () => {
  expect(parseToolResult({ structuredContent: [] })).toEqual([]);
  expect(
    parseToolResult({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            result: JSON.stringify({
              url: "https://rbtqtkjnqtcnljvabisa.supabase.co",
            }),
          }),
        },
      ],
    }),
  ).toEqual({ url: "https://rbtqtkjnqtcnljvabisa.supabase.co" });
  const rows = [{ snapshot: { rows: 1 }, error: "a legitimate data column" }];
  expect(parseToolResult({ structuredContent: JSON.stringify(rows) })).toEqual(
    rows,
  );
  expect(
    parseToolResult({
      structuredContent: {
        result:
          '<untrusted-data-fixture>\\n[{"ok":true}]\\n</untrusted-data-fixture>',
      },
    }),
  ).toEqual([{ ok: true }]);
});

it("rejects missing and malformed results instead of treating them as success", () => {
  for (const response of [
    undefined,
    null,
    { content: [] },
    { structuredContent: null },
    { structuredContent: { result: null } },
    { structuredContent: "not JSON" },
  ])
    expect(() => parseToolResult(response)).toThrow("MCP_RESPONSE_INVALID");
});
