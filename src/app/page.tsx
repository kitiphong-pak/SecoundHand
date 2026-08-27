import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Header } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  // ฟีเจอร์หลัก: กรองสินค้าตามจังหวัดของผู้ใช้งานโดยอัตโนมัติ
  const products = db.products.filter(
    (p) => p.province === user.province && p.status === "listed"
  );

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
              สินค้าใน{user.province}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              แสดงเฉพาะสินค้าในจังหวัดของคุณ เพื่อความสะดวกในการนัดรับ-ส่ง
            </p>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
            ยังไม่มีสินค้าประกาศขายใน{user.province}ตอนนี้
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
