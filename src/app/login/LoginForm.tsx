"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { callApi, messageOf } from "@/lib/apiResponse";

// next ผ่าน safeNextPath มาแล้วจาก page.tsx ฝั่งเซิร์ฟเวอร์ — ที่นี่ใช้ได้เลย ไม่ต้องเช็คซ้ำ
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      email: form.get("email"),
      password: form.get("password"),
    };

    try {
      const data = await callApi<{ user: { role: string } }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.push(data.user.role === "admin" ? "/admin" : next);
      router.refresh();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-[var(--font-display)] text-2xl font-semibold text-neutral-900">
          เข้าสู่ระบบ
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          ยินดีต้อนรับกลับมาที่ songtor
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <Input label="อีเมล" name="email" type="email" placeholder="you@example.com" required />
          <Input label="รหัสผ่าน" name="password" type="password" placeholder="รหัสผ่านของคุณ" required />

          {error && <p className="text-sm text-error-500">{error}</p>}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-500">
          ยังไม่มีบัญชี?{" "}
          <Link href={next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`} className="font-medium text-primary-600 hover:underline">
            สมัครสมาชิก
          </Link>
        </p>

        {/* บัญชีทดสอบโชว์เฉพาะตอนพัฒนาเท่านั้น — ถ้าติดไปกับของจริงคือการแจกรหัสผ่านแอดมิน
            ให้คนทั้งอินเทอร์เน็ต แต่ลบทิ้งไปเลยก็ทำให้ทดสอบในเครื่องลำบากโดยไม่ได้อะไรเพิ่ม
            ค่านี้ถูกแทนที่ตอน build ของ Next ก้อนโค้ดนี้จึงไม่ติดไปใน bundle ของ production */}
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-8 rounded-[var(--radius-md)] bg-neutral-100 p-3 text-xs text-neutral-500">
            <p className="font-medium text-neutral-700">บัญชีทดสอบ (เฉพาะตอนพัฒนา)</p>
            <p className="mt-1">อีเมล: pimchanok@example.com — รหัสผ่าน: password123</p>
            <p>แอดมิน: admin@secoundhand.demo — รหัสผ่าน: password123</p>
          </div>
        )}
      </div>
    </main>
  );
}
