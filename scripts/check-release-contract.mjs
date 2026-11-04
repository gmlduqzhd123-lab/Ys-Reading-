const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (
  !url ||
  !key ||
  !(
    /^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url) ||
    url === "https://rbtqtkjnqtcnljvabisa.supabase.co"
  )
)
  throw Error("RELEASE_TARGET_REQUIRED");
try {
  const r = await fetch(url + "/rest/v1/rpc/service_release_contract", {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  const d = await r.json();
  const w = await fetch(url + "/functions/v1/account-operations?health=1", {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    }),
    v = await w.json();
  if (
    !r.ok ||
    !w.ok ||
    d.protocol !== 2 ||
    !d.reportReview ||
    !d.scopedStaff ||
    !d.operationsCompletion ||
    !d.exportJobs ||
    v.service !== "bookforest-account-worker" ||
    v.protocol < d.minimumWorkerProtocol
  )
    throw Error();
  console.log("Database and account worker release contract verified.");
} catch {
  console.error("RELEASE_CONTRACT_MISMATCH");
  process.exitCode = 1;
}
