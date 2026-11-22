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

import { bookableSlotStarts, bookingCode, formatRupees, formatSlot, istDate, istInstant, isSlotStart } from "./home";
import { DEFAULT_HOME_POLICY, homeBillLines, homeProEarning, homeRefundQuote, homeTotals, homeUnitPrice } from "./home-policy";

describe("home services pricing: base (quote + 5%) + 6% service + 3% platform + 18% GST on all three; pro earns quote - 10%", () => {
  it("the user's example: quote ₹100 -> customer pays ₹135.05, pro earns ₹90", () => {
    const t = homeTotals([{ unitPricePaise: 10_000, qty: 1 }]);
    expect(t.pricing).toEqual({
      quotePaise: 10_000, markupBps: 500, basePaise: 10_500,
      proCommissionBps: 1000, proCommissionPaise: 1_000, proEarningPaise: 9_000,
      serviceChargeBps: 600, serviceChargePaise: 630,
      platformChargeBps: 300, platformChargePaise: 315,
      gstBps: 1800, taxablePaise: 11_445, gstPaise: 2_060, gstOnBasePaise: 1_890, gstOnChargesPaise: 170, // 18% of 114.45 = 20.601
    });
    expect(t).toMatchObject({ subtotalPaise: 10_500, feePaise: 630 + 315 + 170, totalPaise: 13_505 });
    expect(homeBillLines(t)).toEqual([
      { key: "base", label: "Service price", paise: 10_500 },
      { key: "service", label: "Service charge 6%", paise: 630 },
      { key: "platform", label: "Platform & maintenance charge 3%", paise: 315 },
      { key: "gst", label: "GST 18%", paise: 2_060 },
    ]);
  });
  it("fan repair quoted ₹199: rounds each amount to the nearest paisa, half up, and the lines add up", () => {
    expect(homeUnitPrice(19_900)).toBe(20_895);
    const t = homeTotals([{ unitPricePaise: 19_900, qty: 1 }]);
    // 6% of 208.95 = 12.537 -> 12.54; 3% = 6.2685 -> 6.27; 18% of 227.76 = 40.9968 -> 41.00.
    expect(t.pricing).toMatchObject({ basePaise: 20_895, serviceChargePaise: 1_254, platformChargePaise: 627, taxablePaise: 22_776, gstPaise: 4_100, gstOnBasePaise: 3_761, proEarningPaise: 17_910 });
    expect(t.totalPaise).toBe(26_876);
    expect(homeBillLines(t).reduce((s, l) => s + l.paise, 0)).toBe(t.totalPaise);
    expect(t.subtotalPaise + t.pricing.gstOnBasePaise + t.feePaise).toBe(t.totalPaise);
    // Half a paisa rounds up: 10 paise + 5% = 10.5 -> 11.
    expect(homeUnitPrice(10)).toBe(11);
  });
  it("prices each item with the markup first, then charges and GST on the whole order", () => {
    const t = homeTotals([{ unitPricePaise: 9_900, qty: 2 }, { unitPricePaise: 14_900, qty: 1 }]);
    expect(t.pricing).toMatchObject({ quotePaise: 34_700, basePaise: 10_395 * 2 + 15_645, proEarningPaise: 34_700 - 3_470 });
  });
  it("uses the admin's rates", () => {
    const t = homeTotals([{ unitPricePaise: 10_000, qty: 1 }], { markupBps: 0, proCommissionBps: 2000, serviceChargeBps: 500, platformChargeBps: 0 });
    expect(t).toMatchObject({ subtotalPaise: 10_000, totalPaise: 10_500 + 1_890 });
    expect(t.pricing.proEarningPaise).toBe(8_000);
  });
  it("refunds the base and its GST by the slab, rounded down; charges and their GST never", () => {
    const t = homeTotals([{ unitPricePaise: 100_000, qty: 1 }]);
    const q = homeRefundQuote(t, 6 * 60, DEFAULT_HOME_POLICY); // 75%
    expect(q).toMatchObject({ basePaise: 105_000, gstPaise: 18_900, baseRefundPaise: 78_750, gstRefundPaise: 14_175, refundPaise: 92_925, feeKeptPaise: 11_151, chargePaise: 135_051 - 92_925 });
    expect(homeRefundQuote(t, 24 * 60, DEFAULT_HOME_POLICY)).toMatchObject({ refundPaise: 123_900, chargePaise: 11_151 });
  });
  it("pays the professional their quote minus 10%; ZARVA's share of the base is the markup plus the commission", () => {
    expect(homeProEarning(homeTotals([{ unitPricePaise: 100_000, qty: 1 }]), 2000)).toEqual({ grossPaise: 105_000, commissionPaise: 15_000, earningPaise: 90_000 });
  });
  it("still reads legacy GST-inclusive bookings with a flat fee", () => {
    const legacy = { subtotalPaise: 19_900, feePaise: 2_900, totalPaise: 22_800, pricing: null };
    expect(homeRefundQuote(legacy, 6 * 60, DEFAULT_HOME_POLICY).refundPaise).toBe(14_925);
    expect(homeBillLines(legacy).map((l) => l.key)).toEqual(["items", "fee"]);
    expect(homeProEarning(legacy, 2000)).toEqual({ grossPaise: 19_900, commissionPaise: 3_980, earningPaise: 15_920 });
  });
});

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
    expect(homeTotals([])).toMatchObject({ subtotalPaise: 0, feePaise: 0, totalPaise: 0 });
    expect(formatRupees(349900)).toBe("₹3,499");
    expect(formatRupees(4950)).toBe("₹49.50");
    expect(bookingCode("7c9e6679-7425-40de-944b-e07fc1f90ae7")).toMatch(/^ZH-[2-9A-HJ-NP-Z]{6}$/);
  });
});

it("normalises email to lower case and rejects junk", () => {
  expect(emailSchema.parse("  Imdad@Gmail.COM ")).toBe("imdad@gmail.com");
  expect(emailSchema.safeParse("not-an-email").success).toBe(false);
});

describe("reviews and invoices helpers", () => {
  it("shortens reviewer names and never shows an empty name", async () => {
    const { reviewerName } = await import("./home");
    expect(reviewerName("Riya Sen")).toBe("Riya S.");
    expect(reviewerName("  sk md imdad ")).toBe("sk I.");
    expect(reviewerName("Riya")).toBe("Riya");
    expect(reviewerName(null)).toBe("ZARVA customer");
  });
  it("numbers invoices per Indian financial year (April to March, IST)", async () => {
    const { financialYear, invoiceNumber } = await import("./home");
    expect(financialYear(new Date("2026-11-23T05:00:00Z"))).toBe("26-27");
    expect(financialYear(new Date("2027-03-31T18:00:00Z"))).toBe("26-27");
    // 31 Mar 2027 18:30 UTC is 1 Apr 2027 00:00 IST: a new year.
    expect(financialYear(new Date("2027-03-31T18:30:00Z"))).toBe("27-28");
    expect(invoiceNumber("26-27", 42)).toBe("ZH/26-27/000042");
  });
});
