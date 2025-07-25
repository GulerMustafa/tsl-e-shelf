import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { ThemeProvider } from "@/components/theme-provider";
import { DevTools } from "@/components/dev-tools";
import ProgressBarProvider from "../providers/progress-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "tsl-e-shelf",
  description: "tsl-e-shelf tarafından oluşturuldu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ProgressBarProvider>
            <div className="flex flex-col min-h-screen max-w-[1200px] mx-auto text-sm">
              <Header />
              {children}
              <DevTools />
              <Footer />
            </div>
          </ProgressBarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
