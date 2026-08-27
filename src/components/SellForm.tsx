"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { CATEGORIES, CONDITION_LABEL } from "@/lib/categories";

export function SellForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      title: form.get("title"),
      description: form.get("description"),
      price: Number(form.get("price")),
      category: form.get("category"),
      condition: form.get("condition"),
    };

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
        return;
      }
      router.push(`/products/${data.product.id}`);
      router.refresh();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      <div className="flex h-40 items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed border-neutral-300 text-sm text-neutral-400">
        อัปโหลดรูปภาพ (เดโม — ยังไม่รองรับ)
      </div>

      <Input label="ชื่อสินค้า" name="title" placeholder="เช่น จักรยานเสือภูเขา TREK" required />
      <Textarea
        label="รายละเอียดสินค้า"
        name="description"
        rows={4}
        placeholder="สภาพสินค้า ตำหนิ อุปกรณ์ที่ให้มาด้วย..."
        required
      />
      <Input label="ราคา (บาท)" name="price" type="number" min={1} placeholder="0" required />

      <Select label="หมวดหมู่" name="category" defaultValue="" required>
        <option value="" disabled>
          เลือกหมวดหมู่
        </option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>

      <Select label="สภาพสินค้า" name="condition" defaultValue="" required>
        <option value="" disabled>
          เลือกสภาพสินค้า
        </option>
        {Object.entries(CONDITION_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>

      {error && <p className="text-sm text-error-500">{error}</p>}

      <Button type="submit" disabled={submitting} className="mt-2">
        {submitting ? "กำลังลงขาย..." : "ลงขายสินค้า"}
      </Button>
    </form>
  );
}
