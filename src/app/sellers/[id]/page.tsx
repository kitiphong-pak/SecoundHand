import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct, mapReview } from "@/lib/mappers";
import { getUserRating } from "@/lib/rating";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/Badge";
import { ProductCard } from "@/components/ProductCard";
import { LocationPinIcon } from "@/components/ui/LocationPinIcon";

export default async function SellerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  const { id } = await params;
  const { data: sellerRow } = await supabase
    .from("users")
    .select("id, name, province, is_verified")
    .eq("id", id)
    .maybeSingle();
  if (!sellerRow) notFound();

  const [{ data: productRows }, { data: reviewRows }, rating] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("seller_id", id)
      .eq("status", "listed")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("reviews").select("*").eq("to_user_id", id).order("created_at", { ascending: false }).limit(20),
    getUserRating(id),
  ]);
  const products = (productRows ?? []).map(mapProduct);
  const reviews = (reviewRows ?? []).map(mapReview);

  const reviewerIds = [...new Set(reviews.map((r) => r.fromUserId))];
  const { data: reviewerRows } =
    reviewerIds.length > 0
      ? await supabase.from("users").select("id, name").in("id", reviewerIds)
      : { data: [] as { id: string; name: string }[] };
  const nameByReviewer = new Map((reviewerRows ?? []).map((u) => [u.id, u.name]));

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
                {sellerRow.name}
              </h1>
              <p className="mt-1 flex items-center gap-1 text-sm text-neutral-500">
                <LocationPinIcon /> {sellerRow.province}
              </p>
            </div>
            {sellerRow.is_verified ? (
              <Badge status="success">ยืนยันตัวตนแล้ว ✅</Badge>
            ) : (
              <Badge status="neutral">ยังไม่ยืนยันตัวตน</Badge>
            )}
          </div>
          <p className="mt-3 text-sm text-neutral-600">
            {rating.avg !== null ? `⭐ ${rating.avg.toFixed(1)} (${rating.count} รีวิว)` : "ยังไม่มีรีวิว"}
          </p>
        </div>

        <section className="mt-6">
          <h2 className="font-[var(--font-display)] text-lg font-semibold text-neutral-900">
            สินค้าที่ลงขาย ({products.length})
          </h2>
          {products.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">ยังไม่มีสินค้าที่กำลังลงขายตอนนี้</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="font-[var(--font-display)] text-lg font-semibold text-neutral-900">
            รีวิว ({rating.count})
          </h2>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">ยังไม่มีรีวิว</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-[var(--radius-md)] border border-neutral-200 bg-neutral-0 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-neutral-900">
                      {nameByReviewer.get(review.fromUserId) ?? "ผู้ใช้ไม่พบ"}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {new Date(review.createdAt).toLocaleDateString("th-TH")}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-warning-500">{"⭐".repeat(review.rating)}</p>
                  <p className="mt-1 text-sm text-neutral-700">{review.comment}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
