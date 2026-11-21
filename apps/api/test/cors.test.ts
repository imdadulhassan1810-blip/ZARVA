import { afterEach, describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers";

describe("CORS: the website may call every method it uses", () => {
  let t: Awaited<ReturnType<typeof setupTestApp>>;
  afterEach(async () => { await t.close(); });

  it.each(["GET", "POST", "PUT", "PATCH", "DELETE"])("allows %s from the website address", async (method) => {
    t = await setupTestApp({ CORS_ORIGINS: "https://zarva.in" });
    const r = await t.app.inject({
      method: "OPTIONS", url: "/v1/m/home/pro/me/documents/id_front",
      headers: { origin: "https://zarva.in", "access-control-request-method": method, "access-control-request-headers": "authorization,content-type" },
    });
    expect(r.headers["access-control-allow-origin"]).toBe("https://zarva.in");
    expect(String(r.headers["access-control-allow-methods"]).split(",").map((m) => m.trim())).toContain(method);
  });

  it("does not allow other websites", async () => {
    t = await setupTestApp({ CORS_ORIGINS: "https://zarva.in" });
    const r = await t.app.inject({ method: "OPTIONS", url: "/v1/me", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
