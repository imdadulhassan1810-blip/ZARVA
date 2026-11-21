import { afterEach, describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers";

describe("sign-in code abuse limits (every SMS costs money)", () => {
  let t: Awaited<ReturnType<typeof setupTestApp>>;
  afterEach(async () => { await t.close(); });
  const ask = (phone: string, ip = "203.0.113.7") =>
    t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone }, remoteAddress: ip });

  it("one internet address can't ask codes for many different numbers", async () => {
    t = await setupTestApp({ CODE_LIMIT_PER_IP_PER_HOUR: "3" });
    for (const p of ["9876500001", "9876500002", "9876500003"]) expect((await ask(p)).statusCode).toBe(200);
    const blocked = await ask("9876500004");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.message).toMatch(/network/);
    // Someone else, on another network, is not affected.
    expect((await ask("9876500004", "198.51.100.9")).statusCode).toBe(200);
  });

  it("caps SMS codes for the whole platform per hour, but email still works", async () => {
    t = await setupTestApp({ SMS_CODE_LIMIT_PER_HOUR: "2" });
    expect((await ask("9876500001", "198.51.100.1")).statusCode).toBe(200);
    expect((await ask("9876500002", "198.51.100.2")).statusCode).toBe(200);
    const busy = await ask("9876500003", "198.51.100.3");
    expect(busy.statusCode).toBe(429);
    expect(busy.json().error.message).toMatch(/email/);
    const email = await t.app.inject({ method: "POST", url: "/v1/auth/email/request", payload: { email: "riya@example.com" }, remoteAddress: "198.51.100.4" });
    expect(email.statusCode).toBe(200);
  });
});
