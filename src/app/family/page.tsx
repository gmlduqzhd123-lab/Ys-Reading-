import { FamilyPortfolio } from "@/components/classroom/family-portfolio";
export const metadata = {
  title: "가족과 나누는 책숲 성장 기록",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function FamilyPage() {
  return (
    <div className="page-shell">
      <FamilyPortfolio />
    </div>
  );
}
