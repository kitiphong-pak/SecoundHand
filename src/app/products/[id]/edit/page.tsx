import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import { Header } from "@/components/Header";
import { SellForm } from "@/components/SellForm";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  const { id } = await params;
  const { data: row } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();

  const product = mapProduct(row);
  // ไม่ใช่เจ้าของประกาศ — ทำเหมือนไม่มีหน้านี้อยู่เลย ไม่บอกด้วยซ้ำว่ามีประกาศนี้จริง
  if (product.sellerId !== user.id) notFound();
  // แก้ไขได้เฉพาะตอนยังไม่มีคนจอง/ซื้อ พาไปหน้าดูรายละเอียดแทนถ้าสถานะเปลี่ยนไปแล้ว
  if (product.status !== "listed") redirect(`/products/${id}`);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-6">
        <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
          แก้ไขประกาศ
        </h1>
        <SellForm product={product} />
      </main>
    </div>
  );
}
