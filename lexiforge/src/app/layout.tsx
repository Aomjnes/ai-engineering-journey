import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { isLocale, DEFAULT_LOCALE, LOCALE_COOKIE } from "@/lib/i18n/locale";
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
  description: "Học tiếng Anh từ tin tức thật mỗi ngày, đo trình độ minh bạch — English from today's real news.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF9F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1015" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(c) ? c : DEFAULT_LOCALE;
  return (
    <html lang={locale} className={`${serif.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <ShellDataProvider>
          <PrefsProvider initialLocale={locale}>
            <AppShell>{children}</AppShell>
          </PrefsProvider>
        </ShellDataProvider>
      </body>
    </html>
  );
}
