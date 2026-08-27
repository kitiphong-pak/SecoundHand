import Link from "next/link";
import type { Product } from "@/types";

const CONDITION_LABEL: Record<Product["condition"], string> = {
  new: "ใหม่",
  like_new: "เหมือนใหม่",
  good: "สภาพดี",
  fair: "พอใช้",
};

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="block overflow-hidden rounded-[var(--radius-lg)] border border-neutral-200 bg-white transition-shadow hover:shadow-md"
    >
      <div className="flex h-36 items-center justify-center bg-neutral-100 text-xs text-neutral-400">
        ไม่มีรูปภาพ
      </div>
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
