import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WeChatBrowserGuide } from "@/components/wechat-browser-guide";
import { site } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${site.name} · ${site.school}校园智能助手`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1614" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      {/* ColorZilla、Grammarly 等浏览器插件会往 body 上加属性，开发时会误报 hydration 不匹配；这里只忽略 body 自身属性的差异 */}
      <body className="min-h-dvh" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            {children}
            <WeChatBrowserGuide />
            <Toaster position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
