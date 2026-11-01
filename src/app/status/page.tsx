import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ReliabilityPanel } from "@/components/recovery/reliability-panel";
import {
  OperatorBackupStatus,
  type BackupState,
} from "@/components/recovery/operator-backup-status";
export const metadata = { title: "연결 점검·기록 보관" };
export default async function StatusPage() {
  let classes: { id: string; name: string }[] = [];
  let teacher = false;
  let operator = false,
    backup: BackupState | null = null;
  try {
    const p = await getCurrentProfile();
    operator = p?.operator === true;
    teacher =
      !!p &&
      p.role === "teacher" &&
      p.account_active !== false &&
      p.session_fresh !== false &&
      !p.must_change_password;
    if (teacher) {
      const c = await createClient(),
        r = await c.from("classrooms").select("id,name").order("name");
      classes = r.data ?? [];
      if (operator) {
        const b = await c.rpc("operator_backup_state");
        if (!b.error) backup = b.data as BackupState;
      }
    }
  } catch {
    /* Diagnostics must still open during an Auth/DB outage. */
  }
  return (
    <>
      <ReliabilityPanel classes={classes} teacher={teacher} />
      {operator && <OperatorBackupStatus state={backup} />}
    </>
  );
}
