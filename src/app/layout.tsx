import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QoE Lite",
  description:
    "Lender-grade Quality of Earnings reports and Proofs of Cash for SMB M&A.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
