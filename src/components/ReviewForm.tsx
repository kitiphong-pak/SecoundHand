"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

const STARS = [1, 2, 3, 4, 5];

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={28}
      height={28}
      fill={filled ? "#d97706" : "none"}
      stroke={filled ? "#d97706" : "#d1d5db"}
      strokeWidth={filled ? 0 : 1.5}
      strokeLinejoin="round"
    >
      <path d="M12 2.5l2.9 6.3 6.9.7-5.1 4.7 1.4 6.8L12 17.8l-6.1 3.2 1.4-6.8-5.1-4.7 6.9-.7L12 2.5z" />
    </svg>
  );
}

export function ReviewForm({ orderId, targetLabel }: { orderId: string; targetLabel: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-sm font-medium text-neutral-900">ให้คะแนน{targetLabel}</p>
      {error && <p className="text-sm text-error-500">{error}</p>}
      {/* ใช้ SVG วาดเองแทน emoji ⭐/☆ — emoji render ไม่เท่ากันในแต่ละอุปกรณ์/ฟอนต์ ทำให้
          บางเครื่องเห็นดาวเล็กจนกดยาก หรือแยกไม่ออกว่าเลือกอยู่กี่ดวง เพิ่ม padding รอบปุ่ม
          ให้พื้นที่แตะกว้างขึ้นด้วย ไม่ใช่แค่ตัวไอคอน 28px เฉยๆ */}
      <div
        className="-m-1.5 flex"
        onMouseLeave={() => setHovered(0)}
      >
        {STARS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHovered(n)}
            className="p-1.5"
            aria-label={`${n} ดาว`}
            aria-pressed={rating >= n}
          >
            <StarIcon filled={(hovered || rating) >= n} />
          </button>
        ))}
      </div>
      <Textarea
        label="ความคิดเห็น"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="แลกเปลี่ยนสินค้ากันเป็นยังไงบ้าง..."
      />
      <Button
        size="sm"
        disabled={loading || rating === 0 || !comment.trim()}
        onClick={submit}
      >
        {loading ? "กำลังส่ง..." : "ส่งรีวิว"}
      </Button>
    </div>
  );
}
