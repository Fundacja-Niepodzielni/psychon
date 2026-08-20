import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Niepodzielni — platforma szkoleniowa",
  description:
    "Platforma szkoleniowa programu Niepodzielni: kursy, staż, superwizje i certyfikacja.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
