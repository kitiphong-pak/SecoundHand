"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { PROVINCES } from "@/lib/provinces";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      province: form.get("province"),
    };

    try {
      const res = await fetch("/api/auth/register", {
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
          สมัครสมาชิก
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          ระบุจังหวัดของคุณ เพื่อให้เราแสดงสินค้าใกล้คุณ
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <Input label="ชื่อ-นามสกุล" name="name" placeholder="ชื่อ นามสกุล" required />
          <Input label="อีเมล" name="email" type="email" placeholder="you@example.com" required />
          <Input label="รหัสผ่าน" name="password" type="password" placeholder="อย่างน้อย 6 ตัวอักษร" required minLength={6} />
          <Select label="จังหวัด" name="province" defaultValue="" required>
            <option value="" disabled>
              เลือกจังหวัดของคุณ
            </option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>

          {error && <p className="text-sm text-error-500">{error}</p>}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? "กำลังสมัคร..." : "สมัครสมาชิก"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-500">
          มีบัญชีอยู่แล้ว?{" "}
          <Link href="/login" className="font-medium text-primary-600 hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </main>
  );
}
