"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const onLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
  return (
    <Button variant="ghost" size="sm" onClick={onLogout} className={className}>
      ออกจากระบบ
    </Button>
  );
}
