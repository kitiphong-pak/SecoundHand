"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function ChangePasswordForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const form = new FormData(e.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      setError("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ");
        return;
      }
      setSuccess(true);
      (e.target as HTMLFormElement).reset();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
      <Input
        label="รหัสผ่านปัจจุบัน"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
      />
      <Input
        label="รหัสผ่านใหม่"
        name="newPassword"
        type="password"
        placeholder="อย่างน้อย 6 ตัวอักษร"
        autoComplete="new-password"
        minLength={6}
        required
      />
      <Input
        label="ยืนยันรหัสผ่านใหม่"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        minLength={6}
        required
      />

      {error && <p className="text-sm text-error-500">{error}</p>}
      {success && <p className="text-sm text-success-500">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</p>}

      <Button type="submit" disabled={submitting} className="mt-2">
        {submitting ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
      </Button>
    </form>
  );
}
