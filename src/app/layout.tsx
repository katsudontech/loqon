import type { Metadata } from "next";
import { LineBrowserWarning } from "@/components/LineBrowserWarning";
import { InstallPrompt } from "@/components/InstallPrompt";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loqon | ダンスフォーメーション練習",
  description: "構成図と音源を同期して、チームのダンス練習をもっとスマートに。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Loqon",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex flex-col relative overflow-x-hidden">
          {children}
        </main>
        <LineBrowserWarning />
        <InstallPrompt />
      </body>
    </html>
  );
}
