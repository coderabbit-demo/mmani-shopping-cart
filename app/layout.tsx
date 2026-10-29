import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { StoreProvider } from "../components/store-provider";
import { Header, Footer } from "../components/shell";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-geist" });
export const metadata: Metadata = { title: "DeskDrop", description: "Thoughtful essentials for the place where your best ideas happen." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body><StoreProvider><a className="skip-link" href="#main-content">Skip to content</a><Header /><div id="main-content">{children}</div><Footer /></StoreProvider></body>
    </html>
  );
}
