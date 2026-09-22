"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { callApi, messageOf } from "@/lib/apiResponse";

export function BuyButton({
  productId,
  disabled,
  isOwner,
}: {
  productId: string;
  disabled: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onBuy = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await callApi<{ order: { id: string } }>(
        "/api/orders",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        },
        "สั่งซื้อไม่สำเร็จ"
      );
      router.push(`/orders/${data.order.id}`);
    } catch (e) {
      setError(messageOf(e, "สั่งซื้อไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1">
      <Button variant="primary" className="w-full" disabled={disabled || loading} onClick={onBuy}>
        {isOwner ? "สินค้าของคุณ" : loading ? "กำลังสั่งซื้อ..." : "สั่งซื้อ"}
      </Button>
      {error && <p className="mt-1 text-xs text-error-500">{error}</p>}
    </div>
  );
}
