"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function ChatButton({ productId }: { productId: string; sellerId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      className="flex-1"
      onClick={() => router.push(`/chat/${productId}`)}
    >
      แชทกับผู้ขาย
    </Button>
  );
}
