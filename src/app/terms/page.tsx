import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Header } from "@/components/Header";
import { RESERVATION_HOLD_MS, MAX_OPEN_RESERVATIONS_PER_BUYER } from "@/lib/orderFlowConfig";
import { BUYER_CONFIRM_WINDOW_MS } from "@/lib/orderTiming";

export const metadata = {
  title: "เงื่อนไขการใช้งาน | songtor",
  description: "กติกาการใช้ songtor — ระบบไม่ถือเงิน ผู้ซื้อผู้ขายนัดเจอและจ่ายกันเอง",
};

const hours = (ms: number) => Math.round(ms / (60 * 60 * 1000));
const days = (ms: number) => Math.round(ms / (24 * 60 * 60 * 1000));

// ตัวเลขในหน้านี้ดึงจาก config ของ flow ออเดอร์โดยตรง ไม่พิมพ์ซ้ำ — แก้กติกาในระบบเมื่อไหร่
// หน้าเงื่อนไขจะเปลี่ยนตาม ไม่กลายเป็นเอกสารที่พูดคนละเรื่องกับสิ่งที่ระบบทำจริง
export default async function TermsPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        <h1 className="font-[var(--font-display)] text-2xl font-semibold text-neutral-900">
          เงื่อนไขการใช้งาน
        </h1>
        <p className="mt-1 text-sm text-neutral-500">ปรับปรุงล่าสุด 24 กันยายน 2569</p>

        <div className="mt-6 flex flex-col gap-6 text-sm leading-relaxed text-neutral-700">
          <section>
            <h2 className="text-base font-semibold text-neutral-900">songtor คืออะไร</h2>
            <p className="mt-2">
              songtor เป็นที่ประกาศขายของมือสองและนัดเจอกันเพื่อส่งมอบสินค้า
              <strong> เราไม่ได้เป็นคู่สัญญาในการซื้อขาย ไม่ได้ถือเงินของใคร และไม่ได้ตรวจสอบสินค้า</strong>{" "}
              การซื้อขายเกิดขึ้นระหว่างผู้ซื้อกับผู้ขายโดยตรง จ่ายเงินกันเองตอนเจอกัน
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">บัญชีผู้ใช้</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>ใช้ข้อมูลจริงในการสมัคร และรับผิดชอบการรักษารหัสผ่านของตัวเอง</li>
              <li>หนึ่งคนหนึ่งบัญชี ห้ามสวมรอยเป็นคนอื่น</li>
              <li>ผู้ดูแลระงับบัญชีที่ละเมิดเงื่อนไขนี้ได้ โดยเฉพาะการหลอกลวงผู้ใช้รายอื่น</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">ของที่ห้ามขาย</h2>
            <p className="mt-2">
              ของผิดกฎหมาย ของปลอมหรือละเมิดเครื่องหมายการค้า ยาและอาหารเสริมที่ไม่ได้ขึ้นทะเบียน
              อาวุธ สัตว์คุ้มครอง บุหรี่ไฟฟ้า สุรา สื่อลามก ของที่ได้มาโดยมิชอบ
              และสิ่งที่กฎหมายไทยห้ามซื้อขาย
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">การจองและการนัดเจอ</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                ผู้ซื้อจองสินค้าค้างไว้พร้อมกันได้ไม่เกิน {MAX_OPEN_RESERVATIONS_PER_BUYER} ชิ้น
              </li>
              <li>
                การจองที่ไม่มีใครขยับภายใน {hours(RESERVATION_HOLD_MS)} ชั่วโมง
                ระบบจะยกเลิกให้อัตโนมัติและปล่อยสินค้ากลับไปขายต่อ
              </li>
              <li>
                หลังผู้ขายกดส่งมอบ ผู้ซื้อมีเวลา {days(BUYER_CONFIRM_WINDOW_MS)} วันในการกดยืนยันรับของ
                ถ้าเงียบไป ระบบจะถือว่าได้รับแล้วและปิดออเดอร์ให้
              </li>
              <li>เวลาและจุดนัดที่ตกลงกันในแอปมีผลกับทั้งสองฝ่าย หากไปไม่ได้ให้แจ้งอีกฝ่ายล่วงหน้า</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">ความปลอดภัยในการนัดเจอ</h2>
            <p className="mt-2">
              การเดินทางไปเจอกันเป็นความเสี่ยงที่ผู้ใช้รับเอง เราแนะนำให้
              นัดในที่สาธารณะที่มีคนพลุกพล่านและมีกล้องวงจรปิด ไปในเวลากลางวัน
              บอกคนใกล้ตัวว่าไปไหนกับใคร ตรวจสภาพสินค้าให้ครบก่อนจ่ายเงิน
              และไม่โอนเงินล่วงหน้าก่อนเจอตัวจริง
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">รีวิวและเนื้อหาที่ผู้ใช้สร้าง</h2>
            <p className="mt-2">
              รีวิวต้องมาจากการซื้อขายที่เกิดขึ้นจริง ห้ามข้อความหยาบคาย คุกคาม
              หรือเปิดเผยข้อมูลส่วนตัวของผู้อื่น เนื้อหาที่ละเมิดข้อนี้ถูกลบได้โดยผู้ดูแล
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">ข้อจำกัดความรับผิด</h2>
            <p className="mt-2">
              เราให้บริการนี้ตามสภาพที่เป็นอยู่ ไม่รับประกันคุณภาพสินค้า ความถูกต้องของประกาศ
              หรือพฤติกรรมของผู้ใช้รายอื่น ข้อพิพาทเรื่องสินค้าและการชำระเงินเป็นเรื่องระหว่างคู่ซื้อขาย
              โดยตรง — แจ้งผู้ดูแลได้ที่{" "}
              <Link href="/support" className="font-medium text-primary-600 hover:underline">
                หน้าติดต่อผู้ดูแล
              </Link>{" "}
              เราจะช่วยตรวจสอบเท่าที่ข้อมูลในระบบมีอยู่
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">การเปลี่ยนแปลงและกฎหมายที่ใช้บังคับ</h2>
            <p className="mt-2">
              เงื่อนไขนี้อาจปรับปรุงได้ โดยจะแจ้งวันที่ปรับปรุงไว้ด้านบนของหน้า
              และใช้กฎหมายไทยเป็นกฎหมายที่ใช้บังคับ
            </p>
          </section>
        </div>

        <p className="mt-8 text-sm text-neutral-500">
          อ่าน{" "}
          <Link href="/privacy" className="font-medium text-primary-600 hover:underline">
            นโยบายความเป็นส่วนตัว
          </Link>{" "}
          ควบคู่กันได้
        </p>
      </main>
    </div>
  );
}
