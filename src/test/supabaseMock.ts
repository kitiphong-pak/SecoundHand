// Supabase ปลอมสำหรับเทส API route — ใช้ร่วมกันทุกไฟล์เทสแทนที่จะเขียน mock ซ้ำในแต่ละไฟล์
//
// ตัวจริงเป็น query builder ที่ต่อเมธอดกันไปเรื่อยๆ แล้วค่อยยิงจริงตอนสุดท้าย เช่น
//   supabase.from("products").update({...}).eq("id", x).eq("status", "listed").select().maybeSingle()
// ตัวปลอมนี้เลยต้องทำสองอย่าง: คืนตัวเองกลับไปทุกเมธอดเพื่อให้ต่อกันได้ และจดไว้ว่าถูกเรียก
// ด้วยอะไรบ้าง เพื่อให้เทสตรวจได้ว่าโค้ดใส่เงื่อนไขครบไหม (ซึ่งเป็นหัวใจของการกัน race condition
// — เงื่อนไข .eq("status", "listed") ที่หายไปคือช่องโหว่ ไม่ใช่แค่โค้ดไม่สวย)
//
// ผลลัพธ์ที่จะให้ตอบกลับ ใส่ผ่าน queueResult() เรียงตามลำดับที่โค้ดยิงคำสั่ง
//
// ข้อจำกัดที่ต้องรู้: ตัวปลอมนี้ไม่ได้ตรวจว่า SQL ถูกต้องจริงไหม มันเชื่อสิ่งที่เราบอกให้มันตอบ
// ถ้าเราเข้าใจพฤติกรรมของ Supabase ผิด เทสก็จะผ่านทั้งที่ของจริงพัง — เทสชั้นนี้ตอบได้แค่
// "ถ้าฐานข้อมูลตอบแบบนี้ โค้ดตัดสินใจถูกไหม" เท่านั้น

export interface QueryResult {
  data: unknown;
  error: unknown;
}

export interface RecordedCall {
  table: string;
  ops: Array<[string, ...unknown[]]>;
}

// เมธอดที่ต่อกันได้เรื่อยๆ แล้วคืน builder ตัวเดิม (ไม่ใช่ผลลัพธ์)
const CHAINABLE = [
  "select", "insert", "update", "delete", "upsert",
  "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not", "or", "filter",
  "order", "limit", "range", "returns",
] as const;

export function createSupabaseMock() {
  const calls: RecordedCall[] = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const queue: QueryResult[] = [];

  const nextResult = (): QueryResult => queue.shift() ?? { data: null, error: null };

  function makeChain(table: string) {
    const record: RecordedCall = { table, ops: [] };
    calls.push(record);

    const chain: Record<string, unknown> = {};
    for (const method of CHAINABLE) {
      chain[method] = (...args: unknown[]) => {
        record.ops.push([method, ...args]);
        return chain;
      };
    }
    chain.maybeSingle = async () => {
      record.ops.push(["maybeSingle"]);
      return nextResult();
    };
    chain.single = async () => {
      record.ops.push(["single"]);
      return nextResult();
    };
    // builder ตัวจริง await ได้เลยโดยไม่ต้องปิดท้ายด้วย single/maybeSingle
    // (เช่น await supabase.from("products").update({...}).eq("id", id)) เลยต้องทำให้ thenable ด้วย
    chain.then = (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(nextResult()).then(resolve, reject);

    return chain;
  }

  return {
    supabase: {
      from: (table: string) => makeChain(table),
      rpc: async (fn: string, args?: unknown) => {
        rpcCalls.push({ fn, args });
        return nextResult();
      },
    },
    calls,
    rpcCalls,
    /** ใส่ผลลัพธ์ที่จะให้ตอบกลับ เรียงตามลำดับที่โค้ดยิงคำสั่ง */
    queueResult(result: QueryResult) {
      queue.push(result);
    },
    reset() {
      calls.length = 0;
      rpcCalls.length = 0;
      queue.length = 0;
    },
    /** คำสั่งทั้งหมดที่ยิงไปยังตารางนี้ */
    callsTo(table: string) {
      return calls.filter((c) => c.table === table);
    },
  };
}

/** ตรวจว่า builder ตัวนั้นมีการเรียกเมธอดด้วยอาร์กิวเมนต์ชุดนี้ไหม เช่น hasOp(call, "eq", "status", "listed") */
export function hasOp(call: RecordedCall, method: string, ...args: unknown[]) {
  return call.ops.some(
    ([m, ...a]) => m === method && args.every((arg, i) => JSON.stringify(a[i]) === JSON.stringify(arg))
  );
}
