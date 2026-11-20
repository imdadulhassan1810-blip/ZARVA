import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeEach(async () => { t = await setupTestApp(); });
afterEach(async () => { await t.close(); });

const addr = { name: "Imran", phone: "9876543210", line1: "12 GT Road, Burnpur", city: "Asansol", state: "West Bengal", pincode: "713325" };

describe("profile", () => {
  it("updates name, email and language", async () => {
    const s = await t.login();
    const r = await t.app.inject({ method: "PATCH", url: "/v1/me", headers: s.headers, payload: { name: "Imran", email: "i@example.com", preferredLanguage: "bn" } });
    expect(r.json().user).toMatchObject({ name: "Imran", email: "i@example.com", preferredLanguage: "bn" });
  });
  it("rejects a bad email", async () => {
    const s = await t.login();
    const r = await t.app.inject({ method: "PATCH", url: "/v1/me", headers: s.headers, payload: { email: "nope" } });
    expect(r.statusCode).toBe(400);
  });
});

describe("addresses", () => {
  it("first address becomes default; a new default replaces the old one", async () => {
    const s = await t.login();
    const a = (await t.app.inject({ method: "POST", url: "/v1/me/addresses", headers: s.headers, payload: addr })).json().address;
    expect(a.isDefault).toBe(true);
    expect(a.phone).toBe("+919876543210");
    const b = (await t.app.inject({ method: "POST", url: "/v1/me/addresses", headers: s.headers, payload: { ...addr, label: "work", isDefault: true } })).json().address;
    const list = (await t.app.inject({ method: "GET", url: "/v1/me/addresses", headers: s.headers })).json().addresses;
    expect(list.map((x: { id: string; isDefault: boolean }) => [x.id, x.isDefault])).toEqual([[b.id, true], [a.id, false]]);
  });

  it("deleting the default promotes another address", async () => {
    const s = await t.login();
    const a = (await t.app.inject({ method: "POST", url: "/v1/me/addresses", headers: s.headers, payload: addr })).json().address;
    const b = (await t.app.inject({ method: "POST", url: "/v1/me/addresses", headers: s.headers, payload: addr })).json().address;
    expect((await t.app.inject({ method: "DELETE", url: `/v1/me/addresses/${a.id}`, headers: s.headers })).statusCode).toBe(204);
    const list = (await t.app.inject({ method: "GET", url: "/v1/me/addresses", headers: s.headers })).json().addresses;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: b.id, isDefault: true });
  });

  it("users cannot see or edit each other's addresses", async () => {
    const s1 = await t.login("9876543210");
    const s2 = await t.login("9123456780");
    const a = (await t.app.inject({ method: "POST", url: "/v1/me/addresses", headers: s1.headers, payload: addr })).json().address;
    expect((await t.app.inject({ method: "GET", url: "/v1/me/addresses", headers: s2.headers })).json().addresses).toHaveLength(0);
    expect((await t.app.inject({ method: "PATCH", url: `/v1/me/addresses/${a.id}`, headers: s2.headers, payload: { city: "Durgapur" } })).statusCode).toBe(404);
    expect((await t.app.inject({ method: "DELETE", url: `/v1/me/addresses/${a.id}`, headers: s2.headers })).statusCode).toBe(404);
  });

  it("validates PIN code", async () => {
    const s = await t.login();
    const r = await t.app.inject({ method: "POST", url: "/v1/me/addresses", headers: s.headers, payload: { ...addr, pincode: "71332" } });
    expect(r.statusCode).toBe(400);
  });
});
