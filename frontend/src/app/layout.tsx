import type { Metadata } from "next";
import { Inter, Rajdhani } from "next/font/google";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MarketplaceProvider } from "@/components/marketplace/MarketplaceProvider";

import "./globals.css";

const inter = Inter({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-inter",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-rajdhani",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Vault - цифровые товары для игр и сервисов",
  description: "Каталог предложений Steam, игровых предметов и цифровых товаров с ценами в Coins.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body className={`${inter.variable} ${rajdhani.variable}`}>
        <MarketplaceProvider>
          <a className="skip-link" href="#main-content">Перейти к содержимому</a>
          <SiteHeader />
          {children}
          <SiteFooter />
        </MarketplaceProvider>
      </body>
    </html>
  );
}
