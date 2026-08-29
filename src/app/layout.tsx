import type { Metadata } from "next";
import { Prompt, Noto_Sans_Thai } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// ตั้ง data-theme ให้ <html> ก่อน React hydrate เสมอ (ไม่รอ useEffect) กันจอกะพริบสว่าง
// แวบหนึ่งตอนโหลดหน้าสำหรับคนที่เคยเลือกโหมดมืดไว้ — ไม่ตั้งอะไรถ้ายังไม่เคยเลือกเอง เพราะ
// ปล่อยให้ CSS media query (prefers-color-scheme) ใน globals.css จัดการตามค่าระบบแทนอยู่แล้ว
const THEME_INIT_SCRIPT = `
  try {
    var stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
    }
  } catch (e) {}
`;

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["500", "600"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "SecoundHand — ตลาดของมือสองใกล้คุณ",
  description: "ซื้อขายของมือสองออนไลน์ ปลอดภัยด้วยระบบยืนยัน OTP สองฝ่าย",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${prompt.variable} ${notoSansThai.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
