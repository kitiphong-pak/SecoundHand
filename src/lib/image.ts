// บีบอัด/ย่อรูปฝั่ง client ก่อนแปลงเป็น data URL — กันไฟล์ต้นฉบับจากมือถือ (มักหลาย MB)
// ทำให้ payload ที่ส่งขึ้น server หนักเกินไป เพราะเราเก็บรูปเป็น base64 ตรงในข้อมูลสินค้า
// (โปรเจกต์นี้ใช้ in-memory DB ไม่มีที่เก็บไฟล์แยก จึงฝังไว้กับข้อมูลไปเลยง่ายสุด)
export async function fileToCompressedDataUrl(
  file: File,
  maxDim = 1200,
  quality = 0.8
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ไม่สามารถประมวลผลรูปภาพได้");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}
