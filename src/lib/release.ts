// Only public build metadata belongs here; no environment values are enumerated.
export const appVersion = "0.2.0";
export function releaseIdentity() {
  const candidate =
    process.env.BOOKFOREST_BUILD_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    "";
  return {
    version: appVersion,
    commit: /^[a-f0-9]{40}$/.test(candidate) ? candidate : null,
    builtAt: process.env.BOOKFOREST_BUILD_AT || null,
    sourceModified: process.env.BOOKFOREST_BUILD_DIRTY === "true",
    environment:
      process.env.VERCEL_ENV === "production"
        ? "production"
        : process.env.VERCEL_ENV === "preview"
          ? "preview"
          : "local",
  };
}
