import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/Badge";
import { BuyButton } from "@/components/BuyButton";
import { ChatButton } from "@/components/ChatButton";
import { ProductGallery } from "@/components/ProductGallery";
import { CONDITION_LABEL } from "@/lib/categories";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const db = getDb();
  const product = db.products.find((p) => p.id === id);
  if (!product) notFound();

  const seller = db.users.find((u) => u.id === product.sellerId);

  // สถานะ "reserved" อยู่ได้หลายจุดใน order flow — ต้องดูสถานะออเดอร์จริง ไม่งั้นจะค้าง
  // โชว์ "รอชำระเงิน" ทั้งที่จ่ายเงิน/ส่งของไปแล้ว (บั๊กเดียวกับที่เจอในหน้าสินค้าของฉัน)
  const activeOrderBadge =
    product.status === "reserved"
      ? ORDER_STATUS_LABEL[
          db.orders.find((o) => o.productId === product.id && o.status !== "completed")
            ?.status ?? "pending_payment"
        ]
      : null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
        <ProductGallery images={product.images} title={product.title} />

        <div className="mt-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
              {product.title}
            </h1>
            {product.status === "sold" && <Badge status="neutral">ขายแล้ว</Badge>}
            {activeOrderBadge && (
              <Badge status={activeOrderBadge.status}>{activeOrderBadge.label}</Badge>
            )}
          </div>

          <p className="font-[var(--font-display)] text-2xl font-semibold text-primary-600">
            ฿{product.price.toLocaleString("th-TH")}
          </p>

          <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
            <span className="rounded-full bg-neutral-100 px-2.5 py-1">📍 {product.province}</span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1">
              {CONDITION_LABEL[product.condition]}
            </span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1">{product.category}</span>
          </div>

          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-700">
            {product.description}
          </p>

          {seller && (
            <div className="mt-4 flex items-center justify-between rounded-[var(--radius-lg)] border border-neutral-200 bg-white p-4">
              <div>
                <p className="text-sm font-medium text-neutral-900">{seller.name}</p>
                <p className="mt-1">
                  {seller.isVerified ? (
                    <Badge status="success">ยืนยันตัวตนแล้ว ✅</Badge>
                  ) : (
                    <Badge status="neutral">ยังไม่ยืนยันตัวตน</Badge>
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-3">
            {product.sellerId !== user.id && (
              <ChatButton productId={product.id} sellerId={product.sellerId} />
            )}
            <BuyButton
              productId={product.id}
              disabled={product.status !== "listed" || product.sellerId === user.id}
              isOwner={product.sellerId === user.id}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
