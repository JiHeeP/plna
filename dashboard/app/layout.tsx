import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PLNA - 주간 대시보드",
  description: "주간 습관, 목표, 회고를 한눈에 확인하세요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <main className="mx-auto max-w-4xl min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
