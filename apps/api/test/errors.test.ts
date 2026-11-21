import { describe, expect, it } from "vitest";
import { pgErrorCode } from "../src/lib/errors";

describe("pgErrorCode", () => {
  it("reads the code from the error or from the wrapped database error", () => {
    expect(pgErrorCode({ code: "23505" })).toBe("23505");
    expect(pgErrorCode(Object.assign(new Error("Failed query"), { cause: { code: "23505" } }))).toBe("23505");
    expect(pgErrorCode(new Error("boom"))).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
  });
});
