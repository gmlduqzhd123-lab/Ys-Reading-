"use client";

import { useEffect, useState } from "react";
import type { DeliveryHealth } from "@/lib/delivery-health";
import { formatOperationsDate } from "@/lib/operations";
import { deliveryLabels } from "../../../scripts/lib/delivery-monitor.mjs";

const labels: Record<string, string> = {
  ...deliveryLabels,
  DELIVERY_SETUP_PENDING: "운영자 PC의 독립 알림 감시를 준비하고 있어요.",
  DELIVERY_MONITOR_STALE: "독립 알림 감시 신호가 45분 이상 지났어요. 운영자 PC와 감시 작업을 확인해 주세요.",
};

export function DeliveryLiveStatus({ initial }: { initial: DeliveryHealth | null }) {
  const [state, setState] = useState(initial);
  const running = state?.code === "GITHUB_CHECK_RUNNING";
  const runId = state?.runId;
  const [refreshError, setRefreshError] = useState(false);
  const [pausedRun, setPausedRun] = useState<number>();
  useEffect(() => {
    if (!running || !runId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function check() {
      if (document.visibilityState === "visible") {
        attempts++;
        try {
          const response = await fetch("/api/delivery-health?pending=" + runId, {
            cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          });
          if (!response.ok) throw Error();
          const result = await response.json() as DeliveryHealth;
          if (controller.signal.aborted) return;
          setRefreshError(false);
          setState(previous => {
            const latest = result.lastSuccessAt ?? result.notifiedAt;
            const known = previous?.lastSuccessAt ?? previous?.notifiedAt;
            return {
              ...result,
              lastSuccessAt: known && (!latest || Date.parse(known) > Date.parse(latest)) ? known : latest,
            };
          });
        } catch {
          if (!controller.signal.aborted) setRefreshError(true);
        }
      }
      if (attempts >= 15 && !controller.signal.aborted) {
        setPausedRun(runId ?? undefined);
        return;
      }
      if (!controller.signal.aborted) timer = setTimeout(check, 20000);
    }
    timer = setTimeout(check, 20000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [running, runId]);
  const lastSuccess = state?.lastSuccessAt ?? state?.notifiedAt;
  return <>
    <p role="status">
      {refreshError ? "이번 조회가 지연됐어요. 마지막 성공을 유지하고 다시 확인합니다."
        : state ? (labels[state.code] ?? "알림 점검을 다시 확인해 주세요.") : "알림 전달 상태를 확인하지 못했어요."}
      {running && state?.refreshCode && !refreshError && " " + (labels[state.refreshCode] ?? "GitHub 상태를 다시 확인하고 있어요.")}
      {running && (pausedRun === runId ? " 새로고침하면 상태를 다시 확인할 수 있어요." : " 진행 중인 동안 약 20초 간격으로 다시 확인합니다.")}
    </p>
    {state?.observedAt && (
      <p>{state.source === "operator-pc" ? "PC 독립 감시" : "서버의 GitHub 실행 확인"} · {formatOperationsDate(state.observedAt)}</p>
    )}
    <p>마지막으로 확인한 알림 완료 · {lastSuccess ? formatOperationsDate(lastSuccess) : "아직 확인하지 못했어요"}</p>
  </>;
}
