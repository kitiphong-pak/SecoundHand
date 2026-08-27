import type { Metadata } from "next";
import { Prompt, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

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
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
