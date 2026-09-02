"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function UserAdminActions({
  userId,
  isVerified,
  isSuspended,
}: {
  userId: string;
  isVerified: boolean;
  isSuspended: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"verify" | "suspend" | null>(null);
  const [error, setError] = useState("");

  const call = async (path: string, body: object, key: "verify" | "suspend") => {
    setLoading(key);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant={isVerified ? "secondary" : "primary"}
          disabled={loading !== null}
          onClick={() =>
            call(`/api/admin/users/${userId}/verify`, { verified: !isVerified }, "verify")
          }
        >
          {loading === "verify" ? "กำลังทำ..." : isVerified ? "ยกเลิกยืนยัน" : "ยืนยันตัวตน"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading !== null}
          onClick={() =>
            call(`/api/admin/users/${userId}/suspend`, { suspended: !isSuspended }, "suspend")
          }
        >
          {loading === "suspend" ? "กำลังทำ..." : isSuspended ? "เปิดใช้งาน" : "ระงับบัญชี"}
        </Button>
      </div>
      {error && <p className="text-xs text-error-500">{error}</p>}
    </div>
  );
}
