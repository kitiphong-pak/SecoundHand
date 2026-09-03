"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { PROVINCES } from "@/lib/provinces";
import { fileToCompressedDataUrl } from "@/lib/image";
import type { PublicUser } from "@/lib/auth";

export function ProfileForm({ user }: { user: PublicUser }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  const onAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // เผื่อเลือกไฟล์เดิมซ้ำได้อีก
    if (!file) return;

    setError("");
    setUploadingAvatar(true);
    try {
      const compressed = await fileToCompressedDataUrl(file, 400, 0.85);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: compressed, kind: "avatar" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "อัปโหลดรูปไม่สำเร็จ");
      setAvatarUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      province: form.get("province"),
      avatarUrl,
    };

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSuccess(true);
      router.refresh();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full bg-primary-100 text-xl font-medium text-primary-700">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="rounded-[var(--radius-md)] border border-neutral-300 px-3.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {uploadingAvatar ? "กำลังอัปโหลด..." : "เปลี่ยนรูปโปรไฟล์"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onAvatarSelected}
            className="hidden"
          />
        </div>
      </div>

      <Input label="ชื่อ-นามสกุล" name="name" defaultValue={user.name} required />
      <Select label="จังหวัด" name="province" defaultValue={user.province} required>
        {PROVINCES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>

      {error && <p className="text-sm text-error-500">{error}</p>}
      {success && <p className="text-sm text-success-500">บันทึกโปรไฟล์เรียบร้อยแล้ว</p>}

      <Button type="submit" disabled={submitting || uploadingAvatar} className="mt-2">
        {submitting ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}
      </Button>
    </form>
  );
}
