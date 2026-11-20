import { describe, expect, it, vi } from "vitest";
import { emailSchema, formatPhone, phoneSchema, addressInputSchema, ModuleRegistry, parseEnabledModules } from "./index";

describe("phoneSchema", () => {
  it.each(["9876543210", "+91 98765 43210", "09876543210", "919876543210", "+91-98765-43210"])("normalises %s", (p) => {
    expect(phoneSchema.parse(p)).toBe("+919876543210");
  });
  it.each(["12345", "5876543210", "+1 415 555 0100", "98765432101"])("rejects %s", (p) => {
    expect(phoneSchema.safeParse(p).success).toBe(false);
  });
});

describe("addressInputSchema", () => {
  it("rejects bad PIN codes", () => {
    const base = { name: "A", phone: "9876543210", line1: "12 GT Road", city: "Asansol", state: "West Bengal" };
    expect(addressInputSchema.safeParse({ ...base, pincode: "713301" }).success).toBe(true);
    expect(addressInputSchema.safeParse({ ...base, pincode: "013301" }).success).toBe(false);
  });
});

describe("ModuleRegistry", () => {
  it("mounts only enabled modules under their prefix", async () => {
    const reg = new ModuleRegistry<string>();
    const homeRegister = vi.fn();
    const foodRegister = vi.fn();
    reg.add({ manifest: { id: "home", name: "Home", version: "0.1.0", tagline: "" }, register: homeRegister });
    reg.add({ manifest: { id: "food", name: "Food", version: "0.1.0", tagline: "" }, register: foodRegister });
    const statuses = await reg.mount("app", parseEnabledModules(" Home ,"), () => {});
    expect(homeRegister).toHaveBeenCalledWith(expect.objectContaining({ prefix: "/v1/m/home", app: "app" }));
    expect(foodRegister).not.toHaveBeenCalled();
    expect(statuses.map((s) => [s.id, s.enabled])).toEqual([["home", true], ["food", false]]);
  });
  it("refuses duplicate module ids", () => {
    const reg = new ModuleRegistry();
    const m = { manifest: { id: "home" as const, name: "", version: "", tagline: "" }, register: () => {} };
    reg.add(m);
    expect(() => reg.add(m)).toThrow();
  });
});

it("formats phone for display", () => {
  expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
});

import { bookableSlotStarts, bookingCode, formatRupees, formatSlot, homeTotals, istDate, istInstant, isSlotStart } from "./home";

describe("home services rules", () => {
  it("works in IST regardless of server time zone", () => {
    expect(istInstant("2026-11-23", 8).toISOString()).toBe("2026-11-23T02:30:00.000Z");
    expect(istDate(new Date("2026-11-23T19:00:00Z"))).toBe("2026-11-24"); // 00:30 IST next day
    expect(formatSlot("2026-11-23T06:30:00.000Z")).toBe("12 PM – 1 PM");
  });
  it("offers 8 AM to 7 PM slots, at least 2 hours ahead, for 7 days", () => {
    const s = bookableSlotStarts(new Date("2026-11-23T03:30:00Z")); // 09:00 IST
    expect(s[0]!.toISOString()).toBe(istInstant("2026-11-23", 11).toISOString());
    expect(s.length).toBe(9 + 6 * 12);
    expect(s.every(isSlotStart)).toBe(true);
    expect(isSlotStart(istInstant("2026-11-23", 20))).toBe(false);
  });
  it("prices and codes", () => {
    expect(homeTotals([])).toEqual({ subtotalPaise: 0, feePaise: 0, totalPaise: 0 });
    expect(formatRupees(349900)).toBe("₹3,499");
    expect(formatRupees(4950)).toBe("₹49.50");
    expect(bookingCode("7c9e6679-7425-40de-944b-e07fc1f90ae7")).toMatch(/^ZH-[2-9A-HJ-NP-Z]{6}$/);
  });
});

it("normalises email to lower case and rejects junk", () => {
  expect(emailSchema.parse("  Imdad@Gmail.COM ")).toBe("imdad@gmail.com");
  expect(emailSchema.safeParse("not-an-email").success).toBe(false);
});
