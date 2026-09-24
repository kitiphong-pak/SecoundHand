"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/Button";
import { MEETUP_PLACE_MAX_LENGTH } from "@/lib/orderFlowConfig";

export interface PickedPlace {
  lat: number;
  lng: number;
  label: string;
  note: string;
}

/** กลางเชียงใหม่ — ใช้เมื่อยังไม่รู้ว่าผู้ใช้อยู่ไหนและยังไม่เคยนัดที่ไหน */
const FALLBACK_CENTER: [number, number] = [18.7883, 98.9853];

// Nominatim คือบริการค้นหา/แปลงพิกัดเป็นชื่อสถานที่ของ OpenStreetMap ใช้ฟรีโดยไม่ต้องมีคีย์ แต่มี
// กติกาว่าอย่ายิงถี่เกิน 1 ครั้งต่อวินาที เราจึงยิงเฉพาะตอนผู้ใช้กดค้นหาหรือย้ายหมุดเท่านั้น
// ไม่ยิงตามทุกตัวอักษรที่พิมพ์
const NOMINATIM = "https://nominatim.openstreetmap.org";

interface SearchHit {
  display_name: string;
  lat: string;
  lon: string;
}

// หมุดวาดด้วย HTML แทนการใช้ไฟล์รูปของ Leaflet — รูปเริ่มต้นของมันอ้างพาธแบบที่ bundler หาไม่เจอ
// แล้วจะได้หมุดหาย ซึ่งเป็นปัญหาคลาสสิกของ Leaflet บน Next
const pinIcon = L.divIcon({
  className: "",
  html: `<svg viewBox="0 0 24 24" width="32" height="32" fill="#4f46e5" stroke="white" stroke-width="1.5">
    <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>
  </svg>`,
  iconSize: [32, 32],
  iconAnchor: [16, 30],
});

/**
 * เลือกจุดนัดจากแผนที่ — กดบนแผนที่เพื่อปักหมุด หรือค้นหาชื่อสถานที่ก็ได้
 *
 * ทำไมต้องบังคับปักหมุดแทนการพิมพ์ชื่อเอา: ชื่อที่พิมพ์เองอย่าง "หน้าห้าง" ตีความได้หลายแบบและ
 * ระบบเอาไปทำอะไรต่อไม่ได้เลย ส่วนหมุดมีพิกัด กดเปิดแผนที่นำทางต่อได้ทันที — แต่หมุดก็บอก
 * รายละเอียดปลีกย่อยไม่ได้ ("ตรงป้ายรถเมล์") จึงมีช่องหมายเหตุเสริมไว้ให้ ไม่บังคับกรอก
 */
export function MapPicker({
  initial,
  recentPlaces,
  sending,
  onCancel,
  onConfirm,
}: {
  initial?: { lat: number; lng: number; label: string } | null;
  recentPlaces: Array<{ place: string; lat: number; lng: number }>;
  sending: boolean;
  onCancel: () => void;
  onConfirm: (picked: PickedPlace) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : null
  );
  const [label, setLabel] = useState(initial?.label ?? "");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  // อ่านชื่อสถานที่จากพิกัด (reverse geocode) — ได้ชื่อที่คนอ่านรู้เรื่องมาเก็บคู่กับพิกัด
  const describe = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `${NOMINATIM}/reverse?format=json&zoom=18&accept-language=th&lat=${lat}&lon=${lng}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { display_name?: string };
      if (data.display_name) setLabel(data.display_name.slice(0, MEETUP_PLACE_MAX_LENGTH));
    } catch {
      // อ่านชื่อไม่ได้ก็ยังนัดได้ ผู้ใช้พิมพ์ชื่อเองได้ในช่องด้านล่าง
    }
  };

  const movePin = (lat: number, lng: number, nextLabel?: string) => {
    setPicked({ lat, lng });
    markerRef.current?.setLatLng([lat, lng]);
    mapRef.current?.panTo([lat, lng]);
    if (nextLabel) setLabel(nextLabel.slice(0, MEETUP_PLACE_MAX_LENGTH));
    else void describe(lat, lng);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const start = initial
      ? ([initial.lat, initial.lng] as [number, number])
      : recentPlaces[0]
        ? ([recentPlaces[0].lat, recentPlaces[0].lng] as [number, number])
        : FALLBACK_CENTER;

    const map = L.map(containerRef.current).setView(start, initial || recentPlaces[0] ? 16 : 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(start, { icon: pinIcon, draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      movePin(p.lat, p.lng);
    });
    map.on("click", (e: L.LeafletMouseEvent) => movePin(e.latlng.lat, e.latlng.lng));

    mapRef.current = map;
    markerRef.current = marker;

    // ยังไม่เคยนัดที่ไหนเลย ลองถามตำแหน่งปัจจุบันเพื่อเริ่มจากแถวที่ผู้ใช้อยู่ ปฏิเสธก็ใช้ค่าตั้งต้นไป
    if (!initial && recentPlaces.length === 0 && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.setView([pos.coords.latitude, pos.coords.longitude], 15);
        },
        () => {},
        { timeout: 5000 }
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // สร้างแผนที่ครั้งเดียวตอน mount — ค่าที่ใช้ตั้งต้นถูกอ่านไปแล้วในรอบนี้
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${NOMINATIM}/search?format=json&limit=5&countrycodes=th&accept-language=th&q=${encodeURIComponent(query.trim())}`
      );
      setHits(res.ok ? ((await res.json()) as SearchHit[]) : []);
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาสถานที่ เช่น เซ็นทรัลเฟสติวัล เชียงใหม่"
          className="flex-1 rounded-[var(--radius-md)] border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy}>
          ค้นหา
        </Button>
      </form>

      {hits && hits.length === 0 && (
        <p className="text-xs text-neutral-400">ไม่เจอสถานที่นี้ ลองกดปักหมุดบนแผนที่เองได้</p>
      )}
      {hits && hits.length > 0 && (
        <ul className="max-h-28 overflow-y-auto rounded-[var(--radius-md)] border border-neutral-200">
          {hits.map((hit) => (
            <li key={`${hit.lat},${hit.lon}`}>
              <button
                type="button"
                onClick={() => {
                  movePin(Number(hit.lat), Number(hit.lon), hit.display_name);
                  setHits(null);
                }}
                className="w-full px-3 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50"
              >
                {hit.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {recentPlaces.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recentPlaces.map((p) => (
            <button
              key={`${p.lat},${p.lng}`}
              type="button"
              onClick={() => movePin(p.lat, p.lng, p.place)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-brand-text hover:bg-brand-surface"
            >
              {p.place.length > 28 ? `${p.place.slice(0, 28)}…` : p.place}
            </button>
          ))}
        </div>
      )}

      <div ref={containerRef} className="h-56 w-full rounded-[var(--radius-md)] border border-neutral-200" />

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={MEETUP_PLACE_MAX_LENGTH}
        placeholder="ชื่อจุดนัด (แก้ให้สั้นลงได้)"
        className="rounded-[var(--radius-md)] border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={MEETUP_PLACE_MAX_LENGTH}
        placeholder="จุดสังเกตเพิ่มเติม เช่น ตรงป้ายรถเมล์ (ไม่บังคับ)"
        className="rounded-[var(--radius-md)] border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
      />

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={sending || !picked || !label.trim()}
          onClick={() =>
            picked && onConfirm({ lat: picked.lat, lng: picked.lng, label: label.trim(), note: note.trim() })
          }
        >
          ส่งจุดนัดนี้
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
      {!picked && <p className="text-xs text-neutral-400">กดบนแผนที่เพื่อปักหมุดจุดนัด</p>}
      <p className="text-xs text-neutral-400">นัดในที่สาธารณะคนพลุกพล่านเสมอ และดูของให้ครบก่อนจ่ายเงิน</p>
    </div>
  );
}
