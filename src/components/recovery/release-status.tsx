import { releaseIdentity } from "@/lib/release";
import { releaseReadiness } from "@/lib/release-readiness";
import { formatOperationsDate } from "@/lib/operations";
export async function ReleaseStatus() {
  const release = releaseIdentity(),
    readiness = await releaseReadiness();
  return (
    <section className="panel">
      <h2>서비스 버전·호환 상태</h2>
      <p>
        책숲 {release.version} ·{" "}
        {release.environment === "production"
          ? "운영 배포"
          : release.environment === "preview"
            ? "미리보기 배포"
            : "로컬·검사 환경"}
        {release.sourceModified ? " · 저장 전 수정본" : ""}
      </p>
      <p>
        배포 커밋:{" "}
        {release.commit ? (
          <a
            href={`https://github.com/gmlduqzhd123-lab/Ys-Reading-/commit/${release.commit}`}
            target="_blank"
            rel="noreferrer"
          >
            {release.commit.slice(0, 7)}
          </a>
        ) : (
          "확인 불가"
        )}{" "}
        · 빌드 시각:{" "}
        {release.builtAt ? formatOperationsDate(release.builtAt) : "확인 불가"}
      </p>
      <p role="status">
        DB 기능 호환: {readiness.database ? "확인" : "확인 필요"} · 계정 작업자:{" "}
        {readiness.worker ? "확인" : "확인 필요"} · 책숲 비밀번호 안전성 검사:{" "}
        {readiness.passwordSafetyEnabled
          ? "활성"
          : readiness.passwordSafety
            ? "검사 환경에서 준비됨"
            : "확인 필요"}
      </p>
    </section>
  );
}
