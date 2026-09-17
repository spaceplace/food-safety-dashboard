import { describe, expect, it } from "vitest";
import { fixture } from "./helpers.js";
import {
  correctiveActionFor, detectAgents, detectionFor, hazardTypeFor, parseDistribution, productCategoryFor, rootCauseFor, slugify, statusFor,
} from "../fetch/signals/classify.js";
import { buildSignals, diffSignals, signalFromOutbreak, signalFromRecall } from "../fetch/signals/build.js";
import { RULES_HISTORY, RULES_VERSION } from "../fetch/signals/taxonomy.js";
import { mapFsisRecords, type FsisRecord } from "../fetch/sources/fsis-api.js";
import { mapOpenFdaRecords, type OpenFdaResponse } from "../fetch/sources/fda-openfda.js";
import type { Outbreak, Recall, Signal } from "../fetch/types.js";

const names = (text: string) => detectAgents(text).map((a) => a.name);

describe("agents (organism, allergen, foreign material, chemical)", () => {
  it("names pathogens", () => {
    expect(names("Product may be contaminated with Listeria monocytogenes")).toEqual(["Listeria monocytogenes"]);
    expect(names("potential Salmonella contamination")).toEqual(["Salmonella"]);
    expect(names("E. coli O157:H7")).toEqual(["E. coli (STEC)"]);
    expect(names("Shiga toxin-producing E. coli")).toEqual(["E. coli (STEC)"]);
    expect(names("possible Clostridium botulinum growth")).toEqual(["Clostridium botulinum"]);
  });
  it("names allergens only when the wording is about declaration", () => {
    expect(names("Undeclared milk and soy")).toEqual(["Milk", "Soy"]);
    expect(names("Product contains undeclared peanuts")).toEqual(["Peanut"]);
    expect(names("Sesame is not declared in the ingredient statement")).toEqual(["Sesame"]);
    expect(names("Undeclared allergen")).toEqual(["Unspecified allergen"]);
    // "milk" in a reason that is not about declaration is not an allergen finding.
    expect(names("Raw milk tested positive for Salmonella")).toEqual(["Salmonella"]);
  });
  it("names foreign materials and chemicals", () => {
    expect(names("may contain pieces of metal")).toEqual(["Metal"]);
    expect(names("potential foreign material contamination")).toEqual(["Unspecified foreign material"]);
    expect(names("elevated levels of lead")).toEqual(["Lead"]);
    expect(names("contains FD&C Red No. 3, an unapproved color additive")).toEqual(["Unapproved additive or color"]);
  });
  it("returns nothing for regulatory wording", () => {
    expect(names("Import Violation")).toEqual([]);
    expect(names("Produced without benefit of inspection")).toEqual([]);
  });
});

describe("hazard type", () => {
  it("follows the agent group, with organisms first", () => {
    expect(hazardTypeFor(detectAgents("Undeclared milk; product may also contain Listeria"), "")).toBe("biological");
    expect(hazardTypeFor(detectAgents("Undeclared wheat"), "Undeclared wheat")).toBe("allergen");
    expect(hazardTypeFor(detectAgents("pieces of plastic"), "pieces of plastic")).toBe("physical");
    expect(hazardTypeFor(detectAgents("high levels of lead"), "")).toBe("chemical");
  });
  it("falls back to regulatory, other, or undetermined", () => {
    expect(hazardTypeFor([], "Import Violation")).toBe("labeling-regulatory");
    expect(hazardTypeFor([], "Produced Without Benefit of Inspection")).toBe("labeling-regulatory");
    expect(hazardTypeFor([], "Product is unfit for human consumption")).toBe("other");
    expect(hazardTypeFor([], "Firm is recalling the product.")).toBe("undetermined");
  });
});

describe("product category", () => {
  it("picks the most specific category first", () => {
    expect(productCategoryFor("Chicken salad sandwich on wheat", false)).toBe("prepared-foods");
    expect(productCategoryFor("Ground beef patties", false)).toBe("meat");
    expect(productCategoryFor("Chicken sausage links", false)).toBe("poultry");
    expect(productCategoryFor("Smoked salmon", false)).toBe("seafood");
    expect(productCategoryFor("Romaine lettuce hearts", false)).toBe("produce");
    expect(productCategoryFor("Infant formula powder", false)).toBe("infant-and-baby");
    expect(productCategoryFor("Organic peanut butter", false)).toBe("nuts-and-seeds");
    expect(productCategoryFor("Sesame Italian bread", false)).toBe("nuts-and-seeds");
    expect(productCategoryFor("Cheddar cheese", false)).toBe("dairy");
    expect(productCategoryFor("Ground cinnamon", false)).toBe("condiments-and-spices");
  });
  it("labels pet food regardless of wording", () => {
    expect(productCategoryFor("Beef and rice dog food", true)).toBe("pet-food");
  });
  it("returns other when nothing matches", () => {
    expect(productCategoryFor("Item 4471", false)).toBe("other");
  });
});

describe("geography", () => {
  it("reads FSIS state lists", () => {
    expect(parseDistribution(null, ["NJ", "UT"])).toEqual({ scope: "multi-state", states: ["NJ", "UT"], international: false });
    expect(parseDistribution(null, ["TX"])).toEqual({ scope: "single-state", states: ["TX"], international: false });
    expect(parseDistribution(null, ["Nationwide"])).toMatchObject({ scope: "nationwide" });
  });
  it("reads FDA free text", () => {
    expect(parseDistribution("Nationwide", null)).toMatchObject({ scope: "nationwide", states: [] });
    expect(parseDistribution("New York.", null)).toEqual({ scope: "single-state", states: ["NY"], international: false });
    expect(parseDistribution("Distributed in California, Nevada and Arizona", null)).toMatchObject({ scope: "multi-state", states: ["AZ", "CA", "NV"] });
    expect(parseDistribution("CA, NV, and OR.", null)).toMatchObject({ scope: "multi-state", states: ["CA", "NV", "OR"] });
    expect(parseDistribution("Nationwide and Canada", null)).toMatchObject({ scope: "nationwide", international: true });
    expect(parseDistribution("Canada only", null)).toMatchObject({ scope: "international", international: true });
    expect(parseDistribution("", null)).toMatchObject({ scope: "unspecified" });
  });
  it("does not mistake uppercase words for state codes", () => {
    // "IN" and "OR" as words, not in a list.
    expect(parseDistribution("SOLD IN RETAIL STORES", null).states).toEqual([]);
  });
});

describe("root cause", () => {
  it("uses FSIS coded reasons when they are causes", () => {
    expect(rootCauseFor("", ["Misbranding", "Unreported Allergens"])).toMatchObject({ category: "labeling-or-packaging-error", basis: "agency-coded", detail: "Misbranding" });
    expect(rootCauseFor("", ["Import Violation"])).toMatchObject({ category: "import-or-inspection-violation", basis: "agency-coded" });
    expect(rootCauseFor("", ["Processing Defect"])).toMatchObject({ category: "process-deviation", basis: "agency-coded" });
  });
  it("infers from free text when the coded reason is only a hazard", () => {
    expect(rootCauseFor("Product Contamination. The product may contain pieces of metal from a broken piece of equipment.", ["Product Contamination"])).toMatchObject({ category: "equipment-failure", basis: "inferred" });
    expect(rootCauseFor("Undeclared milk. The firm was notified by its supplier that the seasoning contains milk.", null)).toMatchObject({ category: "supplier-ingredient", basis: "inferred" });
    expect(rootCauseFor("Product was packaged in the wrong bag.", null)).toMatchObject({ category: "labeling-or-packaging-error", basis: "inferred" });
    expect(rootCauseFor("Product did not receive the full thermal process.", null)).toMatchObject({ category: "process-deviation" });
  });
  it("says not stated instead of guessing", () => {
    expect(rootCauseFor("Product may be contaminated with Listeria monocytogenes.", ["Product Contamination"])).toEqual({ category: "not-stated", basis: "not-stated", detail: null });
    expect(rootCauseFor("Undeclared milk", null)).toEqual({ category: "not-stated", basis: "not-stated", detail: null });
  });
});

describe("detection", () => {
  it("reads the FSIS discovery sentence", () => {
    expect(detectionFor("The problem was discovered when FSIS received a consumer complaint regarding the product.", false)).toMatchObject({ category: "consumer-complaint", basis: "inferred" });
    expect(detectionFor("The problem was discovered during routine FSIS surveillance activities.", false)).toMatchObject({ category: "agency-sampling-or-inspection" });
    expect(detectionFor("The problem was discovered when the establishment notified FSIS that it had shipped product.", false)).toMatchObject({ category: "firm-self-reported" });
    expect(detectionFor("The problem was discovered when FDA notified FSIS that a sample tested positive.", false)).toMatchObject({ category: "other-agency-or-partner" });
    expect(detectionFor("The problem was discovered as part of an ongoing illness outbreak investigation.", false)).toMatchObject({ category: "illness-report-or-outbreak" });
  });
  it("is not stated for FDA reason text and coded for outbreaks", () => {
    expect(detectionFor("Undeclared milk", false)).toMatchObject({ category: "not-stated", basis: "not-stated" });
    expect(detectionFor("", true)).toMatchObject({ category: "illness-report-or-outbreak", basis: "agency-coded" });
  });
});

describe("corrective action and status", () => {
  it("maps FDA, FSIS, and CDC wording", () => {
    expect(correctiveActionFor({ source: "FDA", agencyStatus: "Ongoing", initiatedBy: "Voluntary: Firm initiated", notificationMethod: "Press Release", recallIssued: null })).toMatchObject({ category: "voluntary-recall" });
    expect(correctiveActionFor({ source: "FDA", agencyStatus: "Ongoing", initiatedBy: "FDA Mandated", notificationMethod: null, recallIssued: null })).toMatchObject({ category: "mandated-recall" });
    expect(correctiveActionFor({ source: "FSIS", agencyStatus: "Public Health Alert", initiatedBy: null, notificationMethod: null, recallIssued: null })).toMatchObject({ category: "public-health-alert" });
    expect(correctiveActionFor({ source: "FSIS", agencyStatus: "Active Recall", initiatedBy: null, notificationMethod: null, recallIssued: null })).toMatchObject({ category: "voluntary-recall" });
    expect(correctiveActionFor({ source: "CDC", agencyStatus: "active", initiatedBy: null, notificationMethod: null, recallIssued: true })).toMatchObject({ category: "investigation-with-recall" });
    expect(correctiveActionFor({ source: "CDC", agencyStatus: "active", initiatedBy: null, notificationMethod: null, recallIssued: null })).toMatchObject({ category: "investigation" });
  });
  it("normalizes status", () => {
    expect(statusFor({ source: "FDA", agencyStatus: "Ongoing" }).normalized).toBe("open");
    expect(statusFor({ source: "FDA", agencyStatus: "Terminated" }).normalized).toBe("closed");
    expect(statusFor({ source: "FSIS", agencyStatus: "Active Recall" }).normalized).toBe("open");
    expect(statusFor({ source: "FSIS", agencyStatus: "Closed Recall", closedYear: "2025" })).toEqual({ normalized: "closed", agency: "Closed Recall (2025)" });
    expect(statusFor({ source: "FSIS", agencyStatus: "Public Health Alert", closedYear: null }).normalized).toBe("open");
    expect(statusFor({ source: "FSIS", agencyStatus: "Public Health Alert", closedYear: "2024" }).normalized).toBe("closed");
    expect(statusFor({ source: "CDC", agencyStatus: "over" })).toEqual({ normalized: "closed", agency: "Outbreak over" });
    expect(statusFor({ source: "CDC", agencyStatus: "unknown" }).normalized).toBe("unknown");
  });
});

describe("signals from real agency records", () => {
  const fsis = mapFsisRecords(JSON.parse(fixture("fsis/recall-api-sample.json")) as FsisRecord[], "t", "2020-01-01");
  const fda = mapOpenFdaRecords((JSON.parse(fixture("fda/enforcement-sample.json")) as OpenFdaResponse).results, "t").recalls;

  it("classifies the FSIS import violation with agency-coded root cause and consumer-complaint detection", () => {
    const s = signalFromRecall(fsis.find((r) => r.id === "fsis:021-2026")!);
    expect(s).toMatchObject({
      slug: "fsis-021-2026",
      kind: "recall",
      source: "FSIS",
      hazardType: "labeling-regulatory",
      productCategory: "meat",
      geography: { scope: "multi-state", states: ["NJ", "UT"] },
      rootCause: { category: "import-or-inspection-violation", basis: "agency-coded" },
      detection: { category: "consumer-complaint" },
      correctiveAction: { category: "voluntary-recall" },
      status: { normalized: "open", agency: "Active Recall" },
      rulesVersion: RULES_VERSION,
    });
    expect(s.inferred).toContain("detection");
    expect(s.inferred).not.toContain("rootCause");
  });
  it("classifies FSIS public health alerts as alerts", () => {
    const alerts = fsis.filter((r) => /public health alert/i.test(r.status)).map(signalFromRecall);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.kind).toBe("public-health-alert");
      expect(a.correctiveAction.category).toBe("public-health-alert");
    }
  });
  it("classifies the FDA sesame recall as an allergen labeling case with FDA-specific gaps flagged", () => {
    const s = signalFromRecall(fda.find((r) => r.id === "fda:99646")!);
    expect(s).toMatchObject({
      source: "FDA",
      hazardType: "allergen",
      agents: [{ name: "Sesame", group: "allergen" }],
      productCategory: "nuts-and-seeds",
      geography: { scope: "single-state", states: ["NY"] },
      correctiveAction: { category: "voluntary-recall" },
      status: { normalized: "open", agency: "Ongoing" },
      classification: "Class III",
    });
    expect(s.rootCause.category).toBe("labeling-or-packaging-error");
    expect(s.missing.some((m) => m.startsWith("detection"))).toBe(true);
    expect(s.inferred).toContain("geography");
  });
  it("never leaves a category blank", () => {
    for (const s of [...fsis, ...fda].map(signalFromRecall)) {
      expect(s.hazardType).toBeTruthy();
      expect(s.productCategory).toBeTruthy();
      expect(s.rootCause.category).toBeTruthy();
      expect(s.detection.category).toBeTruthy();
      expect(s.correctiveAction.category).toBeTruthy();
      expect(["open", "closed", "unknown"]).toContain(s.status.normalized);
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

const outbreak: Outbreak = {
  id: "cdc:salmonella/outbreaks/broccoli-sprouts-09-26",
  agency: "CDC",
  url: "https://www.cdc.gov/salmonella/outbreaks/broccoli-sprouts-09-26/index.html",
  title: "Salmonella Outbreak Linked to Broccoli Sprouts",
  food: "Broccoli Sprouts",
  foodKeys: ["sprouts"],
  pathogen: "Salmonella Bovismorbificans",
  pathogenFamily: "Salmonella",
  status: "active",
  cases: 22,
  hospitalizations: 2,
  deaths: 0,
  stateCount: 4,
  states: [{ state: "WA", cases: 16 }, { state: "ID", cases: 1 }],
  illnessOnsetFrom: "2026-07-07",
  illnessOnsetTo: "2026-08-26",
  postedAt: "2026-09-09",
  updatedAt: "2026-09-11",
  declaredOverAt: null,
  recallIssued: true,
  year: 2026,
  fetchedAt: "t",
  parseWarnings: [],
};

describe("signals from outbreaks", () => {
  it("maps CDC notices with outbreak figures and an honest root cause", () => {
    const s = signalFromOutbreak(outbreak);
    expect(s).toMatchObject({
      slug: "cdc-salmonella-outbreaks-broccoli-sprouts-09-26",
      kind: "outbreak",
      hazardType: "biological",
      agents: [{ name: "Salmonella", group: "organism" }],
      productCategory: "produce",
      geography: { scope: "multi-state", states: ["ID", "WA"], stateCount: 4 },
      rootCause: { category: "not-stated" },
      detection: { category: "illness-report-or-outbreak" },
      correctiveAction: { category: "investigation-with-recall" },
      status: { normalized: "open" },
      outbreak: { cases: 22, hospitalizations: 2, deaths: 0 },
    });
  });
});

function recall(over: Partial<Recall> = {}): Recall {
  return {
    id: "fda:1",
    agency: "FDA",
    url: "u",
    sourceRecordUrl: null,
    title: "Acme recalls cookies",
    firm: "Acme",
    product: "Cookies",
    products: ["Cookies"],
    productCount: 1,
    category: "human-food",
    foodKeys: [],
    reason: "Undeclared milk",
    reasonCategory: "undeclared-allergen",
    classification: "Class II",
    status: "Ongoing",
    states: null,
    distributionPattern: "Nationwide",
    relatedToOutbreak: null,
    recallDate: "2026-08-01",
    reportDate: "2026-08-05",
    initiatedBy: "Voluntary: Firm initiated",
    notificationMethod: "Press Release",
    summary: null,
    closedDate: null,
    closedYear: null,
    agencyUpdatedAt: "2026-08-03",
    processing: null,
    firmLocation: "Denver, CO",
    fetchedAt: "t",
    ...over,
  };
}

const base = { carryOver: [] as Signal[], previousLog: null, sources: {}, windowStart: "2023-09-17" };

describe("build and change log", () => {
  it("writes one initial-load entry, marks records backfilled, and sorts newest first", () => {
    const { file, log } = buildSignals({ ...base, outbreaks: [outbreak], recalls: [recall()], previous: null, now: "2026-09-17T00:00:00Z" });
    expect(file.items.map((s) => s.id)).toEqual(["cdc:salmonella/outbreaks/broccoli-sprouts-09-26", "fda:1"]);
    expect(file.items.every((s) => s.record.backfilled && s.record.firstSeen === "2026-09-17T00:00:00Z")).toBe(true);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ change: "initial-load", count: 2 });
    expect(file.rulesVersion).toBe(RULES_VERSION);
  });
  it("is stable: an unchanged rerun keeps record history and logs nothing", () => {
    const first = buildSignals({ ...base, outbreaks: [], recalls: [recall()], previous: null, now: "2026-09-17T00:00:00Z" });
    const second = buildSignals({ ...base, outbreaks: [], recalls: [recall()], previous: first.file, previousLog: first.log, now: "2026-09-18T00:00:00Z" });
    expect(second.file.items).toEqual(first.file.items);
    expect(second.log.entries).toHaveLength(1);
  });
  it("logs additions, status changes with field diffs, and removals", () => {
    const first = buildSignals({ ...base, outbreaks: [], recalls: [recall(), recall({ id: "fda:2", title: "Beta recalls bread" })], previous: null, now: "2026-09-17T00:00:00Z" });
    const second = buildSignals({
      ...base,
      outbreaks: [],
      recalls: [recall({ status: "Terminated", closedDate: "2026-09-10" }), recall({ id: "fda:3", title: "Gamma recalls jam" })],
      previous: first.file,
      previousLog: first.log,
      now: "2026-09-18T00:00:00Z",
    });
    const kinds = second.log.entries.map((e) => e.change);
    expect(kinds).toEqual(expect.arrayContaining(["closed", "added", "removed", "initial-load"]));
    const closed = second.log.entries.find((e) => e.change === "closed")!;
    expect(closed.fields).toEqual(expect.arrayContaining([
      { field: "status", from: "open", to: "closed" },
      { field: "agency status", from: "Ongoing", to: "Terminated" },
      { field: "closed date", from: null, to: "2026-09-10" },
    ]));
    const updated = second.file.items.find((s) => s.id === "fda:1")!;
    expect(updated.record).toMatchObject({ firstSeen: "2026-09-17T00:00:00Z", lastChanged: "2026-09-18T00:00:00Z", revisions: 1 });
    expect(second.log.entries.find((e) => e.change === "removed")?.id).toBe("fda:2");
  });
  it("keeps carried-over records from a failed source and never logs them as removed", () => {
    const first = buildSignals({ ...base, outbreaks: [outbreak], recalls: [recall()], previous: null, now: "2026-09-17T00:00:00Z" });
    const carried = first.file.items.filter((s) => s.source === "CDC");
    const second = buildSignals({ ...base, outbreaks: [], recalls: [recall()], carryOver: carried, previous: first.file, previousLog: first.log, now: "2026-09-18T00:00:00Z" });
    expect(second.file.items.map((s) => s.id)).toContain(outbreak.id);
    expect(second.log.entries.some((e) => e.change === "removed")).toBe(false);
  });
  it("drops records reported before the window", () => {
    const { file } = buildSignals({ ...base, outbreaks: [], recalls: [recall({ reportDate: "2020-01-01" })], previous: null, now: "2026-09-17T00:00:00Z" });
    expect(file.items).toHaveLength(0);
  });
  it("diffs only tracked fields", () => {
    const a = signalFromRecall(recall());
    const b = signalFromRecall(recall({ fetchedAt: "later", url: "different" }));
    expect(diffSignals(a, b)).toEqual([]);
  });
  it("has a rules history entry for the current version", () => {
    expect(RULES_HISTORY[0].version).toBe(RULES_VERSION);
    expect(slugify("cdc:salmonella/outbreaks/x-09-26")).toBe("cdc-salmonella-outbreaks-x-09-26");
  });
});
