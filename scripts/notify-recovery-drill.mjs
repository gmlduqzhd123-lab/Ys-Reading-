import { notificationClient } from "./lib/github-notification-client.mjs";
import { incidentDecision } from "./lib/incident-notification.mjs";
if (
  process.env.GITHUB_REPOSITORY !== "gmlduqzhd123-lab/Ys-Reading-" ||
  process.env.GITHUB_REF !== "refs/heads/main" ||
  !process.env.GITHUB_TOKEN ||
  !["success", "failure", "cancelled", "skipped"].includes(
    process.env.DRILL_RESULT,
  )
)
  throw Error("DRILL_CONTEXT_REQUIRED");
if (["cancelled", "skipped"].includes(process.env.DRILL_RESULT)) {
  console.log(JSON.stringify({ drill: "unverified" }));
} else {
  const marker = "<!-- bookforest-recovery-drill-v1 -->",
    api = notificationClient({ token: process.env.GITHUB_TOKEN }),
    issues = [];
  for (let page = 1; page <= 10; page++) {
    const rows = await api("/issues?state=open&per_page=100&page=" + page);
    issues.push(...rows.filter((i) => !i.pull_request));
    if (rows.length < 100) break;
    if (page === 10) throw Error("ISSUE_SCAN_LIMIT");
  }
  const healthy = process.env.DRILL_RESULT === "success",
    decision = incidentDecision(healthy, issues, marker),
    run =
      "https://github.com/gmlduqzhd123-lab/Ys-Reading-/actions/runs/" +
      process.env.GITHUB_RUN_ID;
  if (decision.create)
    await api("/issues", "POST", {
      title: "[책숲 운영 알림] 격리 복구 훈련 확인 필요",
      body:
        marker +
        "\n\n독립 PostgreSQL·Auth의 학급 사용 흐름과 암호화 복구 훈련 중 실패가 확인됐습니다. [검사 실행](" +
        run +
        ")에서 실패 단계를 확인해 주세요.\n\n운영 자료의 복원 실패나 실물 외부 복구 완료로 해석하지 않습니다. 학생 자료·키·로그 원문은 이 알림에 포함하지 않습니다.",
    });
  for (const n of decision.close) {
    await api("/issues/" + n + "/comments", "POST", {
      deliveryKey: "drill-recovery|" + issues.find((i) => i.number === n)?.body,
      body:
        "격리된 실제 PostgreSQL·Auth와 암호화 복구 검사 전체가 통과했습니다. [검사 실행](" +
        run +
        ")\n\n다른 실물 PC·별도 운영 클라우드 전환은 별도 확인 대상입니다.",
    });
    await api("/issues/" + n, "PATCH", {
      state: "closed",
      state_reason: "completed",
    });
  }
  console.log(
    JSON.stringify({
      drill: "processed",
      created: decision.create,
      recovered: decision.close.length,
    }),
  );
}
