"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
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
          ยินดีต้อนรับกลับมาที่ SecoundHand
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
          <Link href="/register" className="font-medium text-primary-600 hover:underline">
            สมัครสมาชิก
          </Link>
        </p>

        <div className="mt-8 rounded-[var(--radius-md)] bg-neutral-100 p-3 text-xs text-neutral-500">
          <p className="font-medium text-neutral-700">บัญชีทดสอบ (เดโม)</p>
          <p className="mt-1">อีเมล: pimchanok@example.com — รหัสผ่าน: password123</p>
          <p>แอดมิน: admin@secoundhand.demo — รหัสผ่าน: password123</p>
        </div>
      </div>
    </main>
  );
}
