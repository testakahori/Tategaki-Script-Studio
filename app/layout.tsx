import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tategaki Studio",
  description: "A focused vertical Japanese script editor for voice acting scripts."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
