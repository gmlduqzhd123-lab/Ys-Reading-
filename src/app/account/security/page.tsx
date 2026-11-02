import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { OperatorMfa } from "@/components/operator-mfa";
export const metadata = { title: "운영자 2단계 인증" };
export default async function SecurityPage() {
  const p = await requireProfile();
  if (!p.operator) redirect("/account");
  return <OperatorMfa />;
}
