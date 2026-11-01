import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ReliabilityPanel } from "@/components/recovery/reliability-panel";
export const metadata = { title: "연결 점검·기록 보관" };
export default async function StatusPage() {
  let classes: { id: string; name: string }[] = [];
  let teacher = false;
  try {
    const p = await getCurrentProfile();
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
    }
  } catch {
    /* Diagnostics must still open during an Auth/DB outage. */
  }
  return <ReliabilityPanel classes={classes} teacher={teacher} />;
}
