import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import type {
  User,
  Product,
  Order,
  ChatMessage,
  Review,
} from "@/types";

// ฐานข้อมูลจำลองแบบ in-memory สำหรับเดโม — ไม่ persist ข้าม server restart
// เก็บไว้ที่ globalThis กัน Next.js dev server (HMR) reseed ข้อมูลซ้ำทุกครั้งที่ไฟล์ถูกแก้
interface MockDb {
  users: User[];
  products: Product[];
  orders: Order[];
  messages: ChatMessage[];
  reviews: Review[];
  sessions: Map<string, string>; // token -> userId
}

declare global {
  var __mockDb: MockDb | undefined;
}

// ใช้ UUID แทน counter ไล่เลข — counter แบบ module-level ล้มเหลวได้ง่ายเวลา module
// ถูก re-evaluate ใหม่ (เช่น dev server HMR รีเซ็ตตัวแปรกลับเป็น 1 ทั้งที่ globalThis
// ยังมีข้อมูลเก่าอยู่ ทำให้ id ชนกัน) และจะยิ่งเป็นปัญหาจริงถ้า deploy เป็น serverless
// ที่แต่ละ instance สุ่ม cold start คนละตัวคนละ counter
export function nextId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

function seed(): MockDb {
  const passwordHash = bcrypt.hashSync("password123", 10);

  const users: User[] = [
    { id: nextId("u"), name: "อดิศักดิ์ ใจดี", email: "adisak@example.com", passwordHash, province: "เชียงใหม่", role: "user", isVerified: true, createdAt: new Date().toISOString() },
    { id: nextId("u"), name: "พิมพ์ชนก แสงทอง", email: "pimchanok@example.com", passwordHash, province: "เชียงใหม่", role: "user", isVerified: true, createdAt: new Date().toISOString() },
    { id: nextId("u"), name: "ธนกร ศรีสุข", email: "thanakorn@example.com", passwordHash, province: "กรุงเทพมหานคร", role: "user", isVerified: false, createdAt: new Date().toISOString() },
    { id: nextId("u"), name: "วรรณา ทองคำ", email: "wanna@example.com", passwordHash, province: "กรุงเทพมหานคร", role: "user", isVerified: true, createdAt: new Date().toISOString() },
    { id: nextId("u"), name: "ณัฐพล ชัยมงคล", email: "nattapol@example.com", passwordHash, province: "ขอนแก่น", role: "user", isVerified: false, createdAt: new Date().toISOString() },
    { id: nextId("u"), name: "สุพัตรา บุญมี", email: "supattra@example.com", passwordHash, province: "ภูเก็ต", role: "user", isVerified: true, createdAt: new Date().toISOString() },
    { id: nextId("u"), name: "แอดมิน ระบบ", email: "admin@secoundhand.demo", passwordHash, province: "กรุงเทพมหานคร", role: "admin", isVerified: true, createdAt: new Date().toISOString() },
  ];

  const [u1, u2, u3, u4, u5, u6] = users;

  const productSeeds: Array<Omit<Product, "id" | "createdAt">> = [
    { sellerId: u1.id, title: "จักรยานเสือภูเขา TREK รุ่น Marlin 7", description: "ใช้งานน้อย สภาพดีมาก ล้อ 27.5 เฟรมอลูมิเนียม", price: 8500, category: "กีฬา", condition: "good", province: "เชียงใหม่", images: [], status: "listed" },
    { sellerId: u1.id, title: "โต๊ะทำงานไม้โอ๊ค 120x60", description: "โต๊ะทำงานไม้แท้ ขาเหล็ก แข็งแรง", price: 1800, category: "เฟอร์นิเจอร์", condition: "like_new", province: "เชียงใหม่", images: [], status: "listed" },
    { sellerId: u2.id, title: "กล้อง Canon EOS M50 พร้อมเลนส์คิท", description: "ซื้อมาไม่ถึงปี ใช้งานน้อย ประกันเหลือ 6 เดือน", price: 12500, category: "อิเล็กทรอนิกส์", condition: "like_new", province: "เชียงใหม่", images: [], status: "listed" },
    { sellerId: u2.id, title: "เสื้อหนัง Biker แท้ ไซส์ L", description: "หนังแท้ 100% สภาพดี ไม่มีตำหนิ", price: 2200, category: "เสื้อผ้า", condition: "good", province: "เชียงใหม่", images: [], status: "listed" },
    { sellerId: u3.id, title: "iPhone 13 128GB สีฟ้า", description: "แบต 89% หน้าจอไม่มีรอย มีกล่องครบ", price: 15900, category: "อิเล็กทรอนิกส์", condition: "good", province: "กรุงเทพมหานคร", images: [], status: "listed" },
    { sellerId: u3.id, title: "โซฟา 3 ที่นั่ง สีเทา", description: "ผ้าไม่ขาด ไม่มีคราบ ต้องรถกระบะมารับ", price: 3500, category: "เฟอร์นิเจอร์", condition: "fair", province: "กรุงเทพมหานคร", images: [], status: "sold" },
    { sellerId: u4.id, title: "กระเป๋าเป้ Fjallraven Kanken", description: "สีเหลืองมัสตาร์ด ใช้ไม่ถึง 10 ครั้ง", price: 1200, category: "แฟชั่น", condition: "like_new", province: "กรุงเทพมหานคร", images: [], status: "listed" },
    { sellerId: u4.id, title: "เตียงเหล็ก 5 ฟุต พร้อมที่นอน", description: "แข็งแรง ไม่มีสนิม พร้อมย้ายบ้านด่วน", price: 2500, category: "เฟอร์นิเจอร์", condition: "good", province: "กรุงเทพมหานคร", images: [], status: "listed" },
    { sellerId: u5.id, title: "รองเท้าวิ่ง Nike Pegasus 39 ไซส์ 42", description: "ใส่ 2 ครั้ง ไซส์ไม่พอดีเลยขาย", price: 1900, category: "กีฬา", condition: "like_new", province: "ขอนแก่น", images: [], status: "listed" },
    { sellerId: u5.id, title: "หม้อทอดไร้น้ำมัน Philips 4.1L", description: "ใช้งานปกติดี ทำความสะอาดแล้ว", price: 1400, category: "เครื่องใช้ไฟฟ้า", condition: "good", province: "ขอนแก่น", images: [], status: "listed" },
    { sellerId: u6.id, title: "บอร์ดโต้คลื่น Softboard 8 ฟุต", description: "เหมาะมือใหม่ สภาพดี มีรอยขีดข่วนเล็กน้อย", price: 4200, category: "กีฬา", condition: "fair", province: "ภูเก็ต", images: [], status: "listed" },
    { sellerId: u6.id, title: "แว่นกันแดด Ray-Ban Aviator แท้", description: "ของแท้ มีใบเสร็จ ใช้น้อย", price: 2800, category: "แฟชั่น", condition: "like_new", province: "ภูเก็ต", images: [], status: "listed" },
    { sellerId: u2.id, title: "หนังสือ Harry Potter ครบชุด 7 เล่ม", description: "ปกแข็ง ภาษาอังกฤษ สภาพดี", price: 1500, category: "หนังสือ", condition: "good", province: "เชียงใหม่", images: [], status: "listed" },
    { sellerId: u4.id, title: "จอมอนิเตอร์ Dell 27 นิ้ว 2K", description: "จอสวย ไม่มีจุดเสีย ใช้กับ MacBook", price: 5200, category: "อิเล็กทรอนิกส์", condition: "good", province: "กรุงเทพมหานคร", images: [], status: "reserved" },
    { sellerId: u1.id, title: "เครื่องชงกาแฟ Moka Pot 6 cup", description: "อลูมิเนียม ใช้ไม่กี่ครั้ง", price: 450, category: "เครื่องใช้ไฟฟ้า", condition: "like_new", province: "เชียงใหม่", images: [], status: "listed" },
  ];

  const products: Product[] = productSeeds.map((p) => ({
    ...p,
    id: nextId("p"),
    createdAt: new Date().toISOString(),
  }));

  return {
    users,
    products,
    orders: [],
    messages: [],
    reviews: [],
    sessions: new Map(),
  };
}

export function getDb(): MockDb {
  if (!globalThis.__mockDb) {
    globalThis.__mockDb = seed();
  }
  return globalThis.__mockDb;
}
