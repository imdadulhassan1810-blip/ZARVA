import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verticals, markFileForSize, verticalIds } from "./index";

describe("brand tokens", () => {
  it("CSS variables match TS tokens for every vertical", () => {
    const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
    for (const id of verticalIds) {
      const v = verticals[id];
      expect(css).toContain(`--z-${id}: ${v.flat}`);
      expect(css).toContain(`--z-${id}-from: ${v.from}`);
      expect(css).toContain(`--z-${id}-to: ${v.to}`);
    }
  });
  it("uses flat mark below 48px and rejects below 24px", () => {
    expect(markFileForSize(32)).toBe("zarva-mark-flat.svg");
    expect(markFileForSize(64)).toBe("zarva-mark-color.svg");
    expect(() => markFileForSize(16)).toThrow();
  });
});
