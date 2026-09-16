import { describe, expect, it } from "vitest";
import { fixture } from "./helpers.js";
import { parseActiveCounts } from "../fetch/sources/cdc-counts.js";

describe("CDC active investigation counts", () => {
  it("parses counts by germ and the last-updated date", () => {
    const c = parseActiveCounts(fixture("cdc/outbreaks-page.html"));
    expect(c.counts).toEqual({ Campylobacter: 3, "E. coli": 6, Listeria: 6, Salmonella: 23 });
    expect(c.total).toBe(38);
    expect(c.asOf).toBe("2026-09-16");
  });
  it("throws when the block is missing", () => {
    expect(() => parseActiveCounts("<html><body>nothing here</body></html>")).toThrow();
  });
});
