"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

async function call(url: string, body: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด");
  return data;
}

export function DisputeResolutionButtons({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"seller" | "buyer" | null>(null);
  const [error, setError] = useState("");

  const resolve = async (resolution: "favor_seller" | "favor_buyer") => {
    setLoading(resolution === "favor_seller" ? "seller" : "buyer");
    setError("");
    try {
      await call(`/api/orders/${orderId}/resolve-dispute`, { resolution });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-error-500">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={loading !== null} onClick={() => resolve("favor_seller")}>
          {loading === "seller" ? "กำลังดำเนินการ..." : "ตัดสินให้ผู้ขาย (ปิดการขาย)"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading !== null}
          onClick={() => resolve("favor_buyer")}
        >
          {loading === "buyer" ? "กำลังดำเนินการ..." : "ตัดสินให้ผู้ซื้อ (คืนเงิน)"}
        </Button>
      </div>
    </div>
  );
}
