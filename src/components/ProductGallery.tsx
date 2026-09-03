"use client";

import { useState } from "react";
import Image from "next/image";

export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[var(--radius-lg)] bg-neutral-100 text-sm text-neutral-400">
        ไม่มีรูปภาพ
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-64 w-full overflow-hidden rounded-[var(--radius-lg)] sm:h-80">
        <Image
          src={images[active]}
          alt={title}
          fill
          sizes="(min-width: 640px) 640px, 100vw"
          className="object-cover"
          priority
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              className={[
                "relative h-16 w-16 flex-none overflow-hidden rounded-[var(--radius-md)] border-2",
                i === active ? "border-primary-500" : "border-transparent",
              ].join(" ")}
            >
              <Image src={src} alt={`${title} รูปที่ ${i + 1}`} fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
