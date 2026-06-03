import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@excalidraw/excalidraw/index.css";
import "tldraw/tldraw.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Linkboard",
  description: "링크 기반 실시간 협업 화이트보드"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
