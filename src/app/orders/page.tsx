import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Header } from "@/components/Header";
import { OrderList, type OrderRow } from "@/components/OrderList";
import { getOrderActivityAt } from "@/lib/orderActivity";

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const orderRows: OrderRow[] = db.orders
    .filter((o) => o.buyerId === user.id || o.sellerId === user.id)
    .map((o) => ({
      id: o.id,
      productTitle: db.products.find((p) => p.id === o.productId)?.title ?? "สินค้าไม่พบ",
      isBuyer: o.buyerId === user.id,
      amount: o.amount,
      status: o.status,
      lastActivityAt: getOrderActivityAt(o),
    }))
    // รายการที่เพิ่งมีความเคลื่อนไหวล่าสุด (ไม่ใช่แค่เพิ่งสร้าง) ขึ้นบนสุด
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
          ออเดอร์ของฉัน
        </h1>

        {orderRows.length === 0 ? (
          <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
            ยังไม่มีออเดอร์
          </div>
        ) : (
          <OrderList orders={orderRows} />
        )}
      </main>
    </div>
  );
}
