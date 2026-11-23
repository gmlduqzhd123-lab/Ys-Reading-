import Link from "next/link";
import { deliveryHealth } from "@/lib/delivery-health";
import { formatOperationsDate } from "@/lib/operations";
import { deliveryLabels } from "../../../scripts/lib/delivery-monitor.mjs";
export async function DeliveryStatus() {
  let d;
  try {
    d = await deliveryHealth();
  } catch {}
  const extra: Record<string, string> = {
    DELIVERY_SETUP_PENDING: "운영자 PC의 독립 알림 감시를 준비하고 있어요.",
    DELIVERY_MONITOR_STALE:
      "독립 알림 감시 신호가 45분 이상 지났어요. 운영자 PC와 감시 작업을 확인해 주세요.",
  };
  const labels: Record<string, string> = deliveryLabels;
  return (
    <section className="panel">
      <h2>GitHub 알림 전달 점검</h2>
      <p role="status">
        {!d
          ? "알림 전달 상태를 확인하지 못했어요."
          : (labels[d.code] ??
            extra[d.code] ??
            "알림 점검을 다시 확인해 주세요.")}
      </p>
      <p>
        웹·백업의 정상 여부와 GitHub 알림 단계의 완료를 따로 확인합니다. 예약은
        20분 간격이며, 실제 실행은 지연될 수 있어요.
      </p>
      {d?.observedAt && (
        <p>
          {d.source === "operator-pc"
            ? "PC 독립 감시"
            : "서버의 GitHub 공개 결과 확인"}
          : {formatOperationsDate(d.observedAt)}
        </p>
      )}
      <p>
        마지막으로 확인한 알림 완료 · {d?.lastSuccessAt || d?.notifiedAt
          ? formatOperationsDate(d.lastSuccessAt ?? d.notifiedAt!)
          : "아직 확인하지 못했어요"}
      </p>
      <Link href="https://github.com/gmlduqzhd123-lab/Ys-Reading-/actions/workflows/availability.yml">
        GitHub 점검·알림 실행 보기 →
      </Link>
    </section>
  );
}
