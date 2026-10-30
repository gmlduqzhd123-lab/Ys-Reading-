import { loadHub } from "@/lib/hub-data";
import { LearningHub } from "@/components/hub/learning-hub";
import { googleConnectionState } from "@/lib/google-drive";
export const metadata = { title: "나의 책장 · 함께 자라는 책숲" };
export default async function HubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const params = await searchParams;
  const [data, google] = await Promise.all([
    loadHub(Number(params.page ?? 1), params.tab ?? "reading"),
    googleConnectionState(),
  ]);
  return <LearningHub data={data} initialTab={params.tab} google={google} />;
}
