import { notificationClient } from "./lib/github-notification-client.mjs";
import { incidentDecision } from "./lib/incident-notification.mjs";
import {
  deliveryLabels,
  probeGithubDelivery,
} from "./lib/delivery-monitor.mjs";
if (
  process.env.GITHUB_REPOSITORY !== "gmlduqzhd123-lab/Ys-Reading-" ||
  !process.env.GITHUB_TOKEN
)
  throw Error("NOTIFICATION_CONTEXT_REQUIRED");
const marker = "<!-- bookforest-delivery-incident-v1 -->",
  api = notificationClient({ token: process.env.GITHUB_TOKEN });
const outcomes = [process.env.SERVICE_NOTIFY_OUTCOME, process.env.BACKUP_NOTIFY_OUTCOME];
const verifiedSteps = outcomes.every(x => x === "success");
const failedStep = outcomes.includes("failure");
async function currentDelivery() {
  if (verifiedSteps || failedStep) return {
    configured: true,
    healthy: verifiedSteps,
    code: failedStep ? "GITHUB_NOTIFY_FAILED" : "OK",
    checkedAt: new Date().toISOString(),
  };
  const live = await probeGithubDelivery({
    fetcher: (url, options) =>
      fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: "Bearer " + process.env.GITHUB_TOKEN,
        },
      }),
  });
  if (live.runId === Number(process.env.GITHUB_RUN_ID) && live.code === "OK")
    return {
      configured: true,
      healthy: true,
      code: "OK",
      checkedAt: new Date().toISOString(),
    };
  const response = await fetch("https://reading-blush-zeta.vercel.app/api/delivery-health", {
    signal: AbortSignal.timeout(12000), cache: "no-store",
  });
  if (response.status === 404) return { configured: false };
  if (!response.ok) throw Error("DELIVERY_CHECK_UNAVAILABLE");
  return response.json();
}
{
  const r = await currentDelivery();
  if (!r.configured) {
    console.log(JSON.stringify({ delivery: "setup-pending" }));
  } else {
    const at = Date.parse(r.checkedAt);
    if (
      !Number.isFinite(at) ||
      Math.abs(Date.now() - at) > 120000 ||
      typeof r.healthy !== "boolean"
    )
      throw Error("DELIVERY_CHECK_UNAVAILABLE");
    const issues = [];
    for (let page = 1; page <= 10; page++) {
      const rows = await api("/issues?state=open&per_page=100&page=" + page);
      issues.push(...rows.filter((i) => !i.pull_request));
      if (rows.length < 100) break;
      if (page === 10) throw Error("ISSUE_SCAN_LIMIT");
    }
    const decision = incidentDecision(r.healthy, issues, marker),
      run =
        "https://github.com/gmlduqzhd123-lab/Ys-Reading-/actions/runs/" +
        process.env.GITHUB_RUN_ID;
    const labels = {
      ...deliveryLabels,
      DELIVERY_MONITOR_STALE:
        "PC의 독립 알림 감시 신호가 45분 이상 지났습니다. PC 전원·로그인과 감시 작업을 확인해 주세요.",
    };
    if (decision.create)
      await api("/issues", "POST", {
        title: "[책숲 운영 알림] GitHub 알림 전달 확인 필요",
        body:
          marker +
          "\n\n" +
          (labels[r.code] ?? "GitHub 알림 전달 상태를 다시 확인해 주세요.") +
          "\n\n[점검 실행](" +
          run +
          ")\n\n서비스·백업 자체의 장애와 별도로 확인합니다. 학생 자료나 인증 정보는 포함하지 않습니다.",
      });
    for (const n of decision.close) {
      await api("/issues/" + n + "/comments", "POST", {
        deliveryKey:
          "delivery-recovery|" + issues.find((i) => i.number === n)?.body,
        body:
          "GitHub 알림 단계의 실제 성공과 독립 감시 신호를 확인했습니다. [점검 실행](" +
          run +
          ")",
      });
      await api("/issues/" + n, "PATCH", {
        state: "closed",
        state_reason: "completed",
      });
    }
    console.log(
      JSON.stringify({
        delivery: "processed",
        created: decision.create,
        recovered: decision.close.length,
      }),
    );
  }
}
