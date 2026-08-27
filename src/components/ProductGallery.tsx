"use client";

import { useState } from "react";

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
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL อยู่ใน memory ไม่ใช่ external URL */}
      <img
        src={images[active]}
        alt={title}
        className="h-64 w-full rounded-[var(--radius-lg)] object-cover sm:h-80"
      />
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={[
                "h-16 w-16 flex-none overflow-hidden rounded-[var(--radius-md)] border-2",
                i === active ? "border-primary-500" : "border-transparent",
              ].join(" ")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL อยู่ใน memory ไม่ใช่ external URL */}
              <img src={src} alt={`${title} รูปที่ ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
