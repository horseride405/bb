import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApexPilot",
  description: "Multi-tenant futures strategy platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
