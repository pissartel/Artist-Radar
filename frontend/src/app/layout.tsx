import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import QueryProvider from "@/components/providers/QueryProvider";
import ProductFeaturesProvider from "@/components/providers/ProductFeaturesProvider";
import { isDebugUIVisible } from "@/lib/server/debugUI";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NextStage",
  description: "AI-powered opportunity intelligence for independent artists",
  icons: {
    icon: "/brand/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ProductFeaturesProvider debugUIVisible={isDebugUIVisible()}>
          <QueryProvider>{children}</QueryProvider>
        </ProductFeaturesProvider>
      </body>
    </html>
  );
}
