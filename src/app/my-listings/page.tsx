import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/Badge";
import { RemoveListingButton } from "@/components/RemoveListingButton";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";
import type { OrderStatus } from "@/types";

const PRODUCT_STATUS_BADGE: Record<
  string,
  { label: string; status: "pending" | "success" | "neutral" | "error" | "info" }
> = {
  listed: { label: "กำลังขาย", status: "info" },
  sold: { label: "ขายแล้ว", status: "success" },
  removed: { label: "ลบแล้ว", status: "neutral" },
};

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  const { data: rows } = await supabase
    .from("products")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });
  const products = (rows ?? []).map(mapProduct);

  // สินค้าสถานะ "reserved" อยู่ได้หลายจุดใน order flow (รอชำระ/ชำระแล้ว/รอส่งมอบ/รอ OTP)
  // ต้องดูสถานะออเดอร์จริงแทนป้าย "reserved" เดียวตายตัว ไม่งั้นจะค้างโชว์ "รอชำระเงิน"
  // ทั้งที่จริงจ่ายเงินและส่งของไปแล้ว
  const reservedIds = products.filter((p) => p.status === "reserved").map((p) => p.id);
  const statusByProduct = new Map<string, OrderStatus>();
  if (reservedIds.length > 0) {
    const { data: orderRows } = await supabase
      .from("orders")
      .select("product_id, status")
      .in("product_id", reservedIds)
      .neq("status", "completed");
    for (const o of orderRows ?? []) statusByProduct.set(o.product_id, o.status as OrderStatus);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        <div className="flex items-center justify-between">
          <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
            สินค้าของฉัน
          </h1>
          <Link
            href="/sell"
            className="rounded-[var(--radius-md)] bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            + ลงขายสินค้า
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center">
            <p className="text-sm text-neutral-500">คุณยังไม่มีสินค้าลงขาย</p>
            <p className="max-w-xs text-xs text-neutral-400">
              ลงขายสินค้าชิ้นแรกได้ง่ายๆ แค่ถ่ายรูป ตั้งราคา แล้วรอผู้ซื้อในจังหวัดของคุณติดต่อมา
            </p>
            <Link
              href="/sell"
              className="mt-1 rounded-[var(--radius-md)] bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              + ลงขายสินค้าชิ้นแรกของคุณ
            </Link>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {products.map((product) => {
              const badge =
                product.status === "reserved"
                  ? ORDER_STATUS_LABEL[statusByProduct.get(product.id) ?? "pending_payment"]
                  : PRODUCT_STATUS_BADGE[product.status];
              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-[var(--radius-lg)] border border-neutral-200 bg-white p-4 hover:shadow-sm"
                >
                  <Link href={`/products/${product.id}`} className="flex-1">
                    <p className="text-sm font-medium text-neutral-900">{product.title}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      ฿{product.price.toLocaleString("th-TH")}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3">
                    {badge && <Badge status={badge.status}>{badge.label}</Badge>}
                    {product.status === "listed" && (
                      <RemoveListingButton productId={product.id} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
