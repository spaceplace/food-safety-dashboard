import { describe, expect, it } from "vitest";
import { fixture } from "./helpers.js";
import { mapOpenFdaRecords, type OpenFdaRecord, type OpenFdaResponse } from "../fetch/sources/fda-openfda.js";

const sample = JSON.parse(fixture("fda/enforcement-sample.json")) as OpenFdaResponse;
const base = sample.results[0];
const rec = (over: Partial<OpenFdaRecord>): OpenFdaRecord => ({ ...base, ...over });

describe("openFDA mapping", () => {
  it("maps a real record with dates, classification and reason", () => {
    const { recalls } = mapOpenFdaRecords(sample.results, "2026-09-16T00:00:00Z");
    expect(recalls.length).toBeGreaterThan(0);
    const r = recalls[0];
    expect(r.agency).toBe("FDA");
    expect(r.id).toMatch(/^fda:\d+$/);
    expect(r.reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.recallDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(["Class I", "Class II", "Class III"]).toContain(r.classification);
    expect(r.firm.length).toBeGreaterThan(0);
    expect(r.url).toContain("fda.gov/safety/recalls-market-withdrawals-safety-alerts?search_api_views_fulltext=");
    expect(r.sourceRecordUrl).toContain("api.fda.gov/food/enforcement.json?search=event_id:");
  });
  it("groups products from the same event into one recall", () => {
    const { recalls } = mapOpenFdaRecords([
      rec({ event_id: "1", recall_number: "F-1", product_description: "Chocolate bar 1 oz" }),
      rec({ event_id: "1", recall_number: "F-2", product_description: "Chocolate bar 2 oz" }),
      rec({ event_id: "2", recall_number: "F-3", product_description: "Romaine lettuce" }),
    ], "t");
    expect(recalls.map((r) => r.productCount).sort()).toEqual([1, 2]);
    expect(recalls.find((r) => r.id === "fda:2")?.foodKeys).toContain("lettuce");
  });
  it("drops dietary supplements and labels pet food", () => {
    const { recalls, excludedSupplements } = mapOpenFdaRecords([
      rec({ event_id: "10", product_description: "Vitamin D3 dietary supplement, 60 capsules" }),
      rec({ event_id: "11", product_description: "Chicken flavor dog food, 5 lb bag" }),
      rec({ event_id: "12", product_description: "Ground beef patties" }),
    ], "t");
    expect(excludedSupplements).toBe(1);
    expect(recalls.find((r) => r.id === "fda:11")?.category).toBe("pet-food");
    expect(recalls.find((r) => r.id === "fda:12")?.category).toBe("human-food");
  });
  it("does not turn an allergen reason into a food key", () => {
    const { recalls } = mapOpenFdaRecords([rec({ event_id: "30", product_description: "Granola bars", reason_for_recall: "Undeclared milk" })], "t");
    expect(recalls[0].foodKeys).not.toContain("dairy");
  });
  it("categorizes reasons", () => {
    const { recalls } = mapOpenFdaRecords([
      rec({ event_id: "20", reason_for_recall: "Product may be contaminated with Listeria monocytogenes" }),
      rec({ event_id: "21", reason_for_recall: "Undeclared milk allergen" }),
      rec({ event_id: "22", reason_for_recall: "May contain pieces of metal" }),
      rec({ event_id: "23", reason_for_recall: "Soy not declared in the contains statement." }),
      rec({ event_id: "24", reason_for_recall: "Product may have been improperly pasteurized." }),
    ], "t");
    const cat = (id: string) => recalls.find((r) => r.id === `fda:${id}`)?.reasonCategory;
    expect(cat("20")).toBe("listeria");
    expect(cat("21")).toBe("undeclared-allergen");
    expect(cat("22")).toBe("foreign-material");
    expect(cat("23")).toBe("undeclared-allergen");
    expect(cat("24")).toBe("other-pathogen");
  });
});
