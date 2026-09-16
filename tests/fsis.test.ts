import { describe, expect, it } from "vitest";
import { fixture } from "./helpers.js";
import { mapFsisRecords, parseFsisRss, type FsisRecord } from "../fetch/sources/fsis-api.js";

describe("FSIS recall API mapping", () => {
  const records = JSON.parse(fixture("fsis/recall-api-sample.json")) as FsisRecord[];
  it("maps records with states, classification, and outbreak flag", () => {
    const items = mapFsisRecords(records, "t", "2020-01-01");
    expect(items.length).toBe(records.length);
    const first = items.find((r) => r.id === "fsis:021-2026")!;
    expect(first).toMatchObject({
      agency: "FSIS",
      firm: "El Eden Import Distributor Corp",
      classification: "Class I",
      states: ["NJ", "UT"],
      relatedToOutbreak: false,
      recallDate: "2026-09-09",
      url: "https://www.fsis.usda.gov/recalls-alerts/el-eden-import-distributor-corp-recalls-ineligible-pork-cracklings-products-imported",
    });
    expect(first.products[0]).toContain("De Todito");
    expect(first.foodKeys).toContain("pork");
  });
  it("classifies import violations as regulatory", () => {
    const items = mapFsisRecords(records, "t", "2020-01-01");
    expect(items.find((r) => r.id === "fsis:021-2026")?.reasonCategory).toBe("regulatory");
  });
  it("respects the since date", () => {
    expect(mapFsisRecords(records, "t", "2099-01-01")).toEqual([]);
  });
  it("detects listeria from the title when the reason field is generic", () => {
    const items = mapFsisRecords(records, "t", "2020-01-01");
    const l = items.find((r) => /listeria/i.test(r.title));
    expect(l?.reasonCategory).toBe("listeria");
  });
});

describe("FSIS RSS fallback", () => {
  it("parses items with title, link, and date", () => {
    const items = parseFsisRss(fixture("fsis/recalls.xml"), "t", "2020-01-01");
    expect(items.length).toBeGreaterThan(5);
    expect(items[0].title).toContain("El Eden");
    expect(items[0].url).toMatch(/^https:\/\/www\.fsis\.usda\.gov\//);
    expect(items[0].recallDate).toBe("2026-09-09");
  });
});
