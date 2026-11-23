const labels = {
  saving: "저장 중",
  unsaved: "저장되지 않은 입력",
  unconfirmed: "저장 확인 필요 · 현재 입력 유지",
  draft: "초안 저장됨",
  reading: "독서 기록 저장됨",
  submitted: "선생님께 제출됨",
  encrypted: "이 기기에 암호화 초안 저장됨",
};

export type SaveStatusKind = keyof typeof labels;

export function SaveStatus({ kind }: { kind: SaveStatusKind }) {
  return <strong className="save-status-label" data-kind={kind}>{labels[kind]}</strong>;
}
