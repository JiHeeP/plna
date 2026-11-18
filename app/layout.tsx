import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/layout/bottom-nav";
import { LocalDailyBackupSync } from "@/components/dashboard/local-daily-backup-sync";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "계획 관리",
  description: "1-60-100 증명. 매일의 습관이 큰 목표를 이룹니다.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icons/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "계획 관리",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#fff6f2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LocalDailyBackupSync />
        {/* 메뉴를 본문 앞에 두어, 메뉴가 있을 때만(위젯 화면 제외) 넓은 화면에서 본문이 사이드 메뉴 폭만큼 비켜서게 한다 */}
        <BottomNav />
        <main className="min-h-screen pb-20 lg:pb-8 lg:peer-data-[nav=on]:pl-56">
          <div className="mx-auto w-full max-w-md lg:max-w-6xl">{children}</div>
        </main>
      </body>
    </html>
  );
}
