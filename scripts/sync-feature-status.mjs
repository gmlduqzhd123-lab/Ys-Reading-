import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."),
  manifest = JSON.parse(
    fs.readFileSync(path.join(root, "config/feature-status.json"), "utf8"),
  ),
  pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (
  manifest.format !== "bookforest-feature-status" ||
  manifest.schemaVersion !== 1 ||
  manifest.features.length !== 6 ||
  new Set(manifest.features.map((x) => x.id)).size !== 6
)
  throw Error("FEATURE_MANIFEST_INVALID");
for (const f of manifest.features) {
  if (f.state !== "implemented" || !f.sources.length || !f.tests.length)
    throw Error("FEATURE_STATE_INVALID");
  for (const p of [...f.sources, ...f.tests]) {
    if (
      p.includes("..") ||
      path.isAbsolute(p) ||
      !fs.existsSync(path.join(root, p))
    )
      throw Error("FEATURE_EVIDENCE_MISSING");
  }
}
const lines = [
  "# 책숲 기능·준비 현황 · " + pkg.version,
  "",
  "이 문서는 `config/feature-status.json`에서 자동 생성합니다. `implemented`는 코드와 검사 경로가 준비됐다는 뜻이며 실제 외부 계정 승인·배포·수업 검증 성공을 대신하지 않습니다.",
  "",
  "| 기능 | 코드 상태 | 검사 경로 |",
  "|---|---|---|",
  ...manifest.features.map(
    (f) =>
      "| " +
      f.label +
      " | 구현 | " +
      f.tests.map((p) => "[" + p + "](../" + p + ")").join(" · ") +
      " |",
  ),
  "",
  "## 사용자 준비·별도 검증",
  "",
  "| 항목 | 상태 | 완료 기준 |",
  "|---|---|---|",
  ...manifest.requirements.map(
    (r) => "| " + r.label + " | " + r.state + " | " + r.reason + " |",
  ),
  "",
  "최신 실행 결과는 배포 커밋의 GitHub Actions와 `/status`를 기준으로 확인합니다. `node scripts/operations-report.mjs`는 현재 공개 운영 상태를 별도 JSON으로 생성합니다. 코드 문서에 현재 연결 성공을 고정하지 않습니다.",
  "",
];
const text = lines.join("\n"),
  target = path.join(root, "docs/FEATURE-STATUS.md");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== text)
    throw Error("FEATURE_DOCUMENT_OUT_OF_DATE");
  console.log(
    "Feature manifest, evidence paths and generated document verified.",
  );
} else {
  fs.writeFileSync(target, text);
  console.log("Feature status document synchronized.");
}
