import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/types";
import { CONDITION_LABEL } from "@/lib/categories";
import { LocationPinIcon } from "@/components/ui/LocationPinIcon";
import { Badge } from "@/components/ui/Badge";

const STATUS_BADGE: Record<
  Product["status"],
  { label: string; status: "pending" | "success" | "neutral" | "error" | "info" }
> = {
  listed: { label: "กำลังขาย", status: "info" },
  reserved: { label: "จองแล้ว", status: "pending" },
  sold: { label: "ขายแล้ว", status: "success" },
  removed: { label: "ลบแล้ว", status: "neutral" },
};

// href กำหนดเองได้เพื่อให้หน้าแอดมินใช้การ์ดเดียวกันได้ แต่ลิงก์ไปหน้ารายละเอียดฝั่งแอดมิน
// (หน้า /products/[id] ปกติจะเด้งแอดมินกลับ /admin เพราะเป็นหน้าสำหรับผู้ซื้อ-ผู้ขาย)
// showStatus เปิดเฉพาะหน้าแอดมิน เพราะที่นั่นเห็นสินค้าทุกสถานะปนกัน (ต่างจากหน้าแรกผู้ใช้
// ที่เห็นเฉพาะ listed อยู่แล้ว จึงไม่ต้องมีป้ายบอกอะไร)
export function ProductCard({
  product,
  href,
  showStatus = false,
}: {
  product: Product;
  href?: string;
  showStatus?: boolean;
}) {
  const cover = product.images[0];
  const badge = STATUS_BADGE[product.status];
  return (
    <Link
      href={href ?? `/products/${product.id}`}
      className="block overflow-hidden rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 transition-shadow hover:shadow-md"
    >
      <div className="relative">
        {cover ? (
          <div className="relative h-36 w-full">
            <Image src={cover} alt={product.title} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" />
          </div>
        ) : (
          <div className="flex h-36 items-center justify-center bg-neutral-100 text-xs text-neutral-400">
            ไม่มีรูปภาพ
          </div>
        )}
        {showStatus && (
          <span className="absolute left-2 top-2">
            <Badge status={badge.status}>{badge.label}</Badge>
          </span>
        )}
      </div>
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
