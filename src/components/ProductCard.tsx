import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/types";
import { CONDITION_LABEL } from "@/lib/categories";
import { LocationPinIcon } from "@/components/ui/LocationPinIcon";

export function ProductCard({ product }: { product: Product }) {
  const cover = product.images[0];
  return (
    <Link
      href={`/products/${product.id}`}
      className="block overflow-hidden rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 transition-shadow hover:shadow-md"
    >
      {cover ? (
        <div className="relative h-36 w-full">
          <Image src={cover} alt={product.title} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" />
        </div>
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
          <span className="inline-flex items-center gap-1">
            <LocationPinIcon /> {product.province}
          </span>
          <span>{CONDITION_LABEL[product.condition]}</span>
        </div>
      </div>
    </Link>
  );
}
