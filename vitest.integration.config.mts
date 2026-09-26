import { defineConfig } from "vitest/config";
import path from "path";

// เทสที่ต้องใช้ Postgres จริงในคอนเทนเนอร์ แยก config ออกจากเทสปกติเพราะช้ากว่ากันคนละระดับ
// (วินาที เทียบกับมิลลิวินาที) ถ้าปนกันไว้ npm test จะกลายเป็นคำสั่งที่ไม่มีใครอยากรันบ่อยๆ
// สั่งด้วย npm run test:db
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.itest.ts"],
    // ปลุกคอนเทนเนอร์ + รัน migration ทั้งหมดใช้เวลานานกว่าค่า default ของ vitest
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // ใช้ฐานข้อมูลร่วมกันทั้งไฟล์ จึงห้ามรันขนานกัน ไม่งั้นข้อมูลของแต่ละไฟล์จะชนกัน
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
