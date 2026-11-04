import fs from "node:fs";
import {
  incidentDecision,
  marker as serviceMarker,
  backupMarker,
} from "./lib/incident-notification.mjs";
const backup = process.argv[2] === "--backup",
  marker = backup ? backupMarker : serviceMarker;
const repo = "gmlduqzhd123-lab/Ys-Reading-";
if (process.env.GITHUB_REPOSITORY !== repo || !process.env.GITHUB_TOKEN)
  throw Error("NOTIFICATION_CONTEXT_REQUIRED");
const receipt = JSON.parse(
  fs.readFileSync(
    backup ? "backup-result.json" : "availability-result.json",
    "utf8",
  ),
);
if (typeof receipt.healthy !== "boolean") throw Error("PROBE_RECEIPT_REQUIRED");
async function api(route, method = "GET", body) {
  const r = await fetch("https://api.github.com/repos/" + repo + route, {
    method,
    headers: {
      Authorization: "Bearer " + process.env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw Error("GITHUB_NOTIFICATION_FAILED");
  return r.status === 204 ? null : r.json();
}
const issues = [];
for (let page = 1; page <= 10; page++) {
  const chunk = await api("/issues?state=open&per_page=100&page=" + page);
  issues.push(...chunk.filter((i) => !i.pull_request));
  if (chunk.length < 100) break;
  if (page === 10) throw Error("ISSUE_SCAN_LIMIT");
}
const decision = incidentDecision(receipt.healthy, issues, marker);
const run =
  "https://github.com/" + repo + "/actions/runs/" + process.env.GITHUB_RUN_ID;
if (decision.create)
  await api("/issues", "POST", {
    title: backup
      ? "[책숲 운영 알림] 전체 백업 확인 필요"
      : "[책숲 운영 알림] 서비스 연결 확인 필요",
    body:
      marker +
      (backup
        ? "\n\n@gmlduqzhd123-lab 전체 백업이 실패했거나 최근 복원 검증 신호가 없습니다. 운영자 PC의 전원·로그인·Codex 인증과 백업 상태를 확인해 주세요.\n\n"
        : "\n\n@gmlduqzhd123-lab 서비스 연결 또는 서버 정기 점검 신호에 문제가 확인되었습니다.\n\n") +
      "[서비스 상태](https://reading-blush-zeta.vercel.app/status) · [독립 점검 실행](" +
      run +
      ")" +
      (typeof receipt.errorId === "string" &&
      /^[a-f0-9-]{36}$/i.test(receipt.errorId)
        ? "\n\n문의용 오류 번호: " + receipt.errorId
        : "") +
      "\n\n학생 정보·글·로그인 정보는 이 알림에 포함하지 않습니다. 정상 확인 시 자동으로 복구 알림을 남기고 닫습니다.",
  });
for (const number of decision.close) {
  await api("/issues/" + number + "/comments", "POST", {
    body:
      (backup
        ? "새 전체 백업의 복원 검증 성공을 확인했습니다. [점검 실행]("
        : "서비스와 서버 정기 점검 신호의 회복을 확인했습니다. [점검 실행](") +
      run +
      ")",
  });
  await api("/issues/" + number, "PATCH", {
    state: "closed",
    state_reason: "completed",
  });
}
console.log(
  JSON.stringify({
    notification: "processed",
    created: decision.create,
    recovered: decision.close.length,
  }),
);
