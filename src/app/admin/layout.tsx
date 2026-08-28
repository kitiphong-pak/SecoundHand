import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdminHeader } from "@/components/AdminHeader";

// เกตสิทธิ์แอดมินจุดเดียวตรงนี้ — ทุกหน้าใต้ /admin ไม่ต้องเช็ค role เองซ้ำอีก
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <AdminHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">{children}</main>
    </div>
  );
}
