import { describe, expect, it } from "vitest";
import { parseCompactDate, parseLongDate, parseUsDate } from "../fetch/lib/dates.js";
import { foodKeys } from "../fetch/foods.js";
import { toStateCode } from "../fetch/lib/states.js";

describe("dates", () => {
  it("parses CDC long dates including abbreviations", () => {
    expect(parseLongDate("September 9, 2026")).toBe("2026-09-09");
    expect(parseLongDate("Sept. 11, 2026")).toBe("2026-09-11");
    expect(parseLongDate("Published: February 24, 2026 extra")).toBe("2026-02-24");
    expect(parseLongDate("not a date")).toBeNull();
  });
  it("parses US and compact dates", () => {
    expect(parseUsDate("Last updated: 9/16/2026")).toBe("2026-09-16");
    expect(parseCompactDate("20260909")).toBe("2026-09-09");
    expect(parseCompactDate("2026-09-09")).toBeNull();
  });
});

describe("food keys", () => {
  it("normalizes food descriptions", () => {
    expect(foodKeys("Romaine lettuce")).toEqual(["lettuce"]);
    expect(foodKeys("Shell Eggs")).toEqual(["eggs"]);
    expect(foodKeys("Broccoli Sprouts")).toEqual(["sprouts"]);
    expect(foodKeys("Ready-to-eat pork guanciale")).toEqual(expect.arrayContaining(["pork", "ready-to-eat meals"]));
    expect(foodKeys("")).toEqual([]);
  });
});

describe("states", () => {
  it("maps names and codes", () => {
    expect(toStateCode("New Jersey")).toBe("NJ");
    expect(toStateCode("wa")).toBe("WA");
    expect(toStateCode("Narnia")).toBeNull();
  });
});
