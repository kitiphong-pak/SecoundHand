import { describe, it, expect } from "vitest";
import { BUYER_CONFIRM_WINDOW_MS } from "./orderTiming";

describe("time window constants", () => {
  it("BUYER_CONFIRM_WINDOW_MS เท่ากับ 3 วันพอดี", () => {
    expect(BUYER_CONFIRM_WINDOW_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });
});
