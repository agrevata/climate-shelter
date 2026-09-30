import type { Metadata } from "next";
import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: {
    default: "Climate Shelter · School",
    template: "%s · Climate Shelter",
  },
  description:
    "Pemantauan mikroklimat, energi, air, dan perangkat Climate Shelter School.",
  icons: { icon: "/icon.png", apple: "/brand/climate-shelter-logo.png" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
