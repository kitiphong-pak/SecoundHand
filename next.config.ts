import path from "path";
import type { NextConfig } from "next";

// รูปสินค้าอยู่ใน Supabase Storage (ดู src/lib/storage.ts) — next/image ต้อง allowlist
// โดเมนนี้ไว้ก่อนถึงจะ optimize รูปจาก URL ภายนอกได้
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: "https",
            hostname: new URL(supabaseUrl).hostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
