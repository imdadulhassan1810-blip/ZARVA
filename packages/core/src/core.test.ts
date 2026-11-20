import { describe, expect, it, vi } from "vitest";
import { formatPhone, phoneSchema, addressInputSchema, ModuleRegistry, parseEnabledModules } from "./index";

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
