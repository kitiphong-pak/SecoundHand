"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { CATEGORIES, CONDITION_LABEL } from "@/lib/categories";
import { fileToCompressedDataUrl } from "@/lib/image";

const MAX_IMAGES = 5;

export function SellForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState("");
  const [processingImages, setProcessingImages] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // เผื่อเลือกไฟล์เดิมซ้ำได้อีก
    if (files.length === 0) return;

    setImageError("");
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setImageError(`อัปโหลดได้สูงสุด ${MAX_IMAGES} รูป`);
      return;
    }

    const toProcess = files.slice(0, remaining);
    if (files.length > remaining) {
      setImageError(`อัปโหลดได้สูงสุด ${MAX_IMAGES} รูป — เพิ่มได้อีก ${remaining} รูป`);
    }

    setProcessingImages(true);
    try {
      const compressed = await Promise.all(
        toProcess.map((f) => fileToCompressedDataUrl(f))
      );
      setImages((prev) => [...prev, ...compressed]);
    } catch {
      setImageError("ไม่สามารถประมวลผลรูปภาพบางไฟล์ได้ ลองใหม่อีกครั้ง");
    } finally {
      setProcessingImages(false);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

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
      images,
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
      <div>
        <label className="text-xs font-medium text-neutral-700">
          รูปสินค้า ({images.length}/{MAX_IMAGES})
        </label>

        <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((src, i) => (
            <div key={i} className="group relative aspect-square overflow-hidden rounded-[var(--radius-md)] border border-neutral-200">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL อยู่ใน memory ไม่ใช่ external URL, next/image ไม่จำเป็น */}
              <img src={src} alt={`รูปสินค้า ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label="ลบรูปนี้"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}

          {images.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={processingImages}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border-2 border-dashed border-neutral-300 text-neutral-400 hover:border-primary-500 hover:text-primary-500"
            >
              <span className="text-xl leading-none">+</span>
              <span className="text-[11px]">{processingImages ? "กำลังโหลด..." : "เพิ่มรูป"}</span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onFilesSelected}
          className="hidden"
        />

        {imageError && <p className="mt-1.5 text-xs text-error-500">{imageError}</p>}
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

      <Button type="submit" disabled={submitting || processingImages} className="mt-2">
        {submitting ? "กำลังลงขาย..." : "ลงขายสินค้า"}
      </Button>
    </form>
  );
}
