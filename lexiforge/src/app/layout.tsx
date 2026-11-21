import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/lf/app-shell";
import { PrefsProvider, THEME_BOOT_SCRIPT } from "@/components/lf/prefs";
import { ShellDataProvider } from "@/components/lf/shell-data";

// The vietnamese subset is mandatory: explanations use full Vietnamese diacritics.
const serif = Newsreader({ subsets: ["latin", "vietnamese"], variable: "--font-serif", style: ["normal", "italic"], display: "swap" });
const sans = Plus_Jakarta_Sans({ subsets: ["latin", "vietnamese"], variable: "--font-sans", weight: ["400", "500", "600", "700"], display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "vietnamese"], variable: "--font-mono", weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: "LexiForge",
  description: "English mastery from today's real news, with deterministic proficiency tracking.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF9F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1015" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <PrefsProvider>
          <ShellDataProvider>
            <AppShell>{children}</AppShell>
          </ShellDataProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
