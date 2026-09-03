import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdminShell } from "@/components/AdminShell";

// เกตสิทธิ์แอดมินจุดเดียวตรงนี้ — ทุกหน้าใต้ /admin ไม่ต้องเช็ค role เองซ้ำอีก
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return <AdminShell user={user}>{children}</AdminShell>;
}
