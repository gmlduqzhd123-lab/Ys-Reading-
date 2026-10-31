import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
import "./paper-gallery.css";
import "./participation.css";
import { Noto_Serif_KR } from "next/font/google";
const literary = Noto_Serif_KR({ weight: "variable", subsets: ["latin"], display: "swap", preload: false, variable: "--font-literary" });

export const metadata: Metadata = {
  title: { default: "책숲 — 생각이 자라는 독서 여행", template: "%s | 책숲" },
  description:
    "읽고, 질문하고, 쓰고, 다시 생각해요. 초등학생과 선생님이 함께하는 독서인문교육 책숲.",
  metadataBase: new URL("https://reading-blush-zeta.vercel.app"),
  appleWebApp: { capable: true, title: "책숲" },
  icons: { icon: "/icons/favicon-32.png", apple: "/icons/apple-touch-icon.png" },
  openGraph: {
    type: "website", siteName: "책숲", locale: "ko_KR", url: "https://reading-blush-zeta.vercel.app/",
    title: "책숲 — 생각이 자라는 독서 여행",
    description: "읽고, 질문하고, 쓰고, 다시 생각해요. 초등학생과 선생님이 함께하는 독서인문교육 책숲.",
    images: [{ url: "https://reading-blush-zeta.vercel.app/og-image.jpg", width: 1200, height: 630, alt: "책숲 독서 여행" }],
  },
  twitter: { card: "summary_large_image", images: ["https://reading-blush-zeta.vercel.app/og-image.jpg"] },
};
export const viewport: Viewport = { themeColor: "#faf9f6" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={literary.variable} data-qr-url="https://reading-blush-zeta.vercel.app/" data-qr-src="/qr.svg" data-qr-name="책숲">
      <body>
        {/* 📲 앱 설치 도우미와 📱 QR 창 (엽쌤의 다른 앱과 같은 도구) */}
        <script src="/ys-install.js" defer />
        <script src="/ys-qr.js" defer />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
