export const deliveryDelayMs = 60 * 60000;
export const deliveryCodes = [
  "OK",
  "GITHUB_CHECK_DELAYED",
  "GITHUB_NOTIFY_FAILED",
  "GITHUB_STATUS_UNAVAILABLE",
  "GITHUB_RATE_LIMITED",
  "GITHUB_CHECK_RUNNING",
];
export const deliveryLabels = {
  OK: "GitHub 점검과 알림 단계가 정상입니다.",
  GITHUB_CHECK_DELAYED:
    "GitHub 점검·알림 확인이 60분 이상 지연됐습니다. 마지막 실행과 GitHub Actions 상태를 확인해 주세요.",
  GITHUB_NOTIFY_FAILED:
    "점검 실행의 GitHub 알림 단계가 실패했습니다. 다음 실행에서 미전송 알림을 다시 처리합니다.",
  GITHUB_STATUS_UNAVAILABLE:
    "GitHub의 실행·알림 결과를 확인하지 못했습니다. 정상으로 간주하지 않고 다시 점검합니다.",
  GITHUB_RATE_LIMITED:
    "GitHub 조회 요청이 제한됐어요. 마지막으로 확인한 알림 결과를 표시하고 다시 점검합니다.",
  GITHUB_CHECK_RUNNING:
    "GitHub 점검이 진행 중입니다. 알림 단계 완료를 기다립니다.",
};
const repo = "gmlduqzhd123-lab/Ys-Reading-";
export async function probeGithubDelivery({
  fetcher = fetch,
  now = Date.now(),
} = {}) {
  const get = async (p) => {
    const r = await fetcher("https://api.github.com/repos/" + repo + p, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
      redirect: "error",
    });
    if (r.status === 429 || (r.status === 403 && (
      r.headers.get("x-ratelimit-remaining") === "0" || r.headers.has("retry-after")
    ))) throw Error("GITHUB_RATE_LIMITED");
    if (!r.ok) throw Error("GITHUB_STATUS_UNAVAILABLE");
    return r.json();
  };
  try {
    const list = await get(
      "/actions/workflows/availability.yml/runs?per_page=5",
    );
    const runs = (list.workflow_runs ?? []).filter(
      (r) =>
        r.head_branch === "main" &&
        r.name === "Bookforest availability" &&
        ["push", "schedule", "workflow_dispatch"].includes(r.event),
    );
    const latest = runs[0];
    if (!latest || !Number.isSafeInteger(latest.id) || latest.id < 1)
      throw Error("GITHUB_STATUS_UNAVAILABLE");
    const completed =
      latest.status === "in_progress"
        ? latest
        : runs.find((r) => r.status === "completed");
    if (!completed)
      return {
        code: "GITHUB_CHECK_RUNNING",
        runId: latest.id,
        notifiedAt: null,
      };
    const jobs = await get(
      "/actions/runs/" + completed.id + "/jobs?per_page=100",
    );
    const job = jobs.jobs?.find((j) => j.name === "public-service");
    const required = [
      "Notify one incident and its recovery",
      "Notify backup incident and recovery",
    ];
    const extra = job?.steps?.find(
      (s) =>
        s.name ===
        "Check independent notification delivery and retry pending incidents",
    );
    const success =
      job &&
      required.every((name) =>
        job.steps?.some((s) => s.name === name && s.conclusion === "success"),
      ) &&
      (!extra ||
        extra.conclusion === "success" ||
        (completed.status === "in_progress" &&
          ["in_progress", "queued"].includes(extra.status)));
    if (
      completed.status === "in_progress" &&
      !required.every((name) =>
        job?.steps?.some((s) => s.name === name && s.conclusion === "success"),
      )
    )
      return {
        code: "GITHUB_CHECK_RUNNING",
        runId: completed.id,
        notifiedAt: null,
      };
    if (!success)
      return {
        code: "GITHUB_NOTIFY_FAILED",
        runId: completed.id,
        notifiedAt: null,
      };
    const at = Date.parse(
      completed.status === "in_progress"
        ? job.steps
            ?.filter(
              (s) => required.includes(s.name) && s.conclusion === "success",
            )
            .map((s) => s.completed_at)
            .filter(Boolean)
            .sort()
            .at(-1)
        : job.completed_at,
    );
    if (!Number.isFinite(at) || at > now + 60000)
      throw Error("GITHUB_STATUS_UNAVAILABLE");
    return {
      code: now - at > deliveryDelayMs ? "GITHUB_CHECK_DELAYED" : "OK",
      runId: completed.id,
      notifiedAt: new Date(at).toISOString(),
    };
  } catch (error) {
    return {
      code: error?.message === "GITHUB_RATE_LIMITED" ? "GITHUB_RATE_LIMITED" : "GITHUB_STATUS_UNAVAILABLE",
      runId: null,
      notifiedAt: null,
    };
  }
}
