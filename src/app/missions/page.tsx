import { MissionCatalog } from "@/components/mission-catalog";
export const metadata = { title: "독서미션" };
export default function MissionsPage() {
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">EXPLORE YOUR NEXT CHAPTER</span>
        <h1>작은 질문, 새로운 발견.</h1>
        <p>내가 고른 책과 함께 용기, 공감, 공정함을 탐험해요.</p>
      </div>
      <MissionCatalog />
    </>
  );
}
