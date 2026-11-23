import Link from "next/link";
import { deliveryHealth } from "@/lib/delivery-health";
import { DeliveryLiveStatus } from "./delivery-live-status";
export async function DeliveryStatus() {
  let d;
  try {
    d = await deliveryHealth();
  } catch {}
  return (
    <section className="panel">
      <h2>GitHub 알림 전달 점검</h2>
      <DeliveryLiveStatus initial={d ?? null} />
      <p>
        웹·백업의 정상 여부와 GitHub 알림 단계의 완료를 따로 확인합니다. 예약은
        20분 간격이며, 실제 실행은 지연될 수 있어요.
      </p>
      <Link href="https://github.com/gmlduqzhd123-lab/Ys-Reading-/actions/workflows/availability.yml">
        GitHub 점검·알림 실행 보기 →
      </Link>
    </section>
  );
}
