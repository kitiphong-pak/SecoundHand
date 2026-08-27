import Link from "next/link";
import type { Product } from "@/types";
import { CONDITION_LABEL } from "@/lib/categories";

export function ProductCard({ product }: { product: Product }) {
  const cover = product.images[0];
  return (
    <Link
      href={`/products/${product.id}`}
      className="block overflow-hidden rounded-[var(--radius-lg)] border border-neutral-200 bg-white transition-shadow hover:shadow-md"
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL อยู่ใน memory ไม่ใช่ external URL
        <img src={cover} alt={product.title} className="h-36 w-full object-cover" />
      ) : (
        <div className="flex h-36 items-center justify-center bg-neutral-100 text-xs text-neutral-400">
          ไม่มีรูปภาพ
        </div>
      )}
      <div className="flex flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium text-neutral-900">{product.title}</p>
        <p className="font-[var(--font-display)] text-base font-medium text-primary-600">
          ฿{product.price.toLocaleString("th-TH")}
        </p>
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>📍 {product.province}</span>
          <span>{CONDITION_LABEL[product.condition]}</span>
        </div>
      </div>
    </Link>
  );
}
