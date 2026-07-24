import type { Metadata, Viewport } from "next";
import { Inter, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import AlarmScheduler from "@/components/AlarmScheduler";
import DevPanel from "@/components/DevPanel";
import PwaSetup from "@/components/PwaSetup";

const urdu = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-urdu",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sehat Saathi — صحت ساتھی",
  description:
    "اپنے نسخے کی تصویر لیں، آسان اردو میں سنیں، اور دوا کے الارم پائیں۔ Photograph your prescription, hear it in simple Urdu, and get picture medicine alarms.",
  manifest: "/manifest.webmanifest",
  applicationName: "Sehat Saathi",
  appleWebApp: {
    capable: true,
    title: "Sehat",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ur"
      dir="rtl"
      suppressHydrationWarning
      className={`${urdu.variable} ${inter.variable}`}
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <LanguageProvider>
          {children}
          <AlarmScheduler />
          <DevPanel />
          <PwaSetup />
        </LanguageProvider>
      </body>
    </html>
  );
}
