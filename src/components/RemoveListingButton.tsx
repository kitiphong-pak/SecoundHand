"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function RemoveListingButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/products/${productId}/remove`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ลบประกาศไม่สำเร็จ");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ลบประกาศไม่สำเร็จ");
      setLoading(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-neutral-400 hover:text-error-500"
      >
        ลบประกาศ
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5 rounded-[var(--radius-md)] border border-error-500/30 bg-error-50 p-2">
      {error && <p className="text-xs text-error-500">{error}</p>}
      <p className="text-xs text-neutral-700">ยืนยันลบประกาศนี้?</p>
      <div className="flex gap-1.5">
        <Button size="sm" variant="primary" disabled={loading} onClick={remove}>
          {loading ? "กำลังลบ..." : "ยืนยันลบ"}
        </Button>
        <Button size="sm" variant="secondary" disabled={loading} onClick={() => setConfirming(false)}>
          ไม่ลบ
        </Button>
      </div>
    </div>
  );
}
