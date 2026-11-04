export function safeErrorDigest(error: unknown): string | null {
  const digest =
    error && typeof error === "object" && "digest" in error
      ? error.digest
      : null;
  return typeof digest === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(digest)
    ? digest
    : null;
}
