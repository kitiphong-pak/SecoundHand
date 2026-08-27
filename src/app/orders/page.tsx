import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const orders = db.orders
    .filter((o) => o.buyerId === user.id || o.sellerId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
          ออเดอร์ของฉัน
        </h1>

        {orders.length === 0 ? (
          <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
            ยังไม่มีออเดอร์
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {orders.map((order) => {
              const product = db.products.find((p) => p.id === order.productId);
              const isBuyer = order.buyerId === user.id;
              const badge = ORDER_STATUS_LABEL[order.status];
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-[var(--radius-lg)] border border-neutral-200 bg-white p-4 hover:shadow-sm"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {product?.title ?? "สินค้าไม่พบ"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {isBuyer ? "คุณเป็นผู้ซื้อ" : "คุณเป็นผู้ขาย"} · ฿
                      {order.amount.toLocaleString("th-TH")}
                    </p>
                  </div>
                  {badge && <Badge status={badge.status}>{badge.label}</Badge>}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
