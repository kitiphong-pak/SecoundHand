import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";

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

  const db = getDb();
  const products = db.products
    .filter((p) => p.sellerId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
          <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
            คุณยังไม่มีสินค้าลงขาย
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {products.map((product) => {
              // สินค้าสถานะ "reserved" อยู่ได้หลายจุดใน order flow (รอชำระ/ชำระแล้ว/รอส่งมอบ/รอ OTP)
              // ต้องดูสถานะออเดอร์จริงแทนป้าย "reserved" เดียวตายตัว ไม่งั้นจะค้างโชว์ "รอชำระเงิน"
              // ทั้งที่จริงจ่ายเงินและส่งของไปแล้ว
              const badge =
                product.status === "reserved"
                  ? ORDER_STATUS_LABEL[
                      db.orders.find((o) => o.productId === product.id && o.status !== "completed")
                        ?.status ?? "pending_payment"
                    ]
                  : PRODUCT_STATUS_BADGE[product.status];
              return (
                <Link
                  key={product.id}
                  href={`/products/${product.id}`}
                  className="flex items-center justify-between rounded-[var(--radius-lg)] border border-neutral-200 bg-white p-4 hover:shadow-sm"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{product.title}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      ฿{product.price.toLocaleString("th-TH")}
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
