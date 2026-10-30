import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "책숲 — 생각이 자라는 독서 여행", template: "%s | 책숲" },
  description:
    "읽고, 질문하고, 쓰고, 다시 생각해요. 초등학생과 선생님이 함께하는 독서인문교육 책숲.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
