import { describe, expect, it } from "vitest";
import { fixture } from "./helpers.js";
import {
  outbreakId, parseInvestigationPage, parseLocationsPage, parseMapConfig, parseOutbreakIndex, parseOutbreakList, pathogenFamily,
} from "../fetch/sources/cdc-outbreaks.js";

describe("CDC outbreak list CSV", () => {
  const rows = parseOutbreakList(fixture("cdc/full-outbreak-list.csv"));
  it("parses every row with a link", () => {
    expect(rows.length).toBeGreaterThan(200);
    for (const r of rows) expect(r.path).toMatch(/^\//);
  });
  it("extracts food, pathogen and year from HTML cells", () => {
    expect(rows[0]).toEqual({ path: "/salmonella/outbreaks/broccoli-sprouts-09-26/index.html", food: "Broccoli Sprouts", pathogen: "Salmonella Bovismorbificans", year: 2026 });
    expect(rows.find((r) => r.food === "Alfalfa Sprouts")?.pathogen).toContain("E. coli O26:H11");
  });
  it("falls back to the slug when the year cell is a footnote", () => {
    expect(rows.every((r) => r.year === null || (r.year >= 2006 && r.year <= 2100))).toBe(true);
    expect(rows.filter((r) => r.year === 2026).length).toBeGreaterThanOrEqual(10);
  });
});

describe("CDC outbreak index page", () => {
  it("parses an open outbreak", () => {
    const d = parseOutbreakIndex(fixture("cdc/broccoli-sprouts-index.html"));
    expect(d).toMatchObject({
      title: "Salmonella Outbreak Linked to Broccoli Sprouts",
      status: "active",
      recallIssued: true,
      cases: 22, hospitalizations: 2, deaths: 0, stateCount: 4,
      postedAt: "2026-09-09", updatedAt: "2026-09-11",
      declaredOverAt: null,
    });
    expect(d.warnings).toEqual([]);
  });
  it("parses a closed outbreak", () => {
    const d = parseOutbreakIndex(fixture("cdc/oysters-index.html"));
    expect(d).toMatchObject({ status: "over", recallIssued: false, cases: 80, hospitalizations: 34, deaths: 0, stateCount: 23, postedAt: "2025-12-23", updatedAt: "2026-02-24" });
    expect(d.warnings).toEqual([]);
  });
  it("parses the older template that has no 'About This Page' block (dates from meta tags)", () => {
    const d = parseOutbreakIndex(fixture("cdc/raw-cheese-index.html"));
    expect(d).toMatchObject({ status: "over", recallIssued: true, cases: 9, hospitalizations: 3, deaths: 0, stateCount: 3, postedAt: "2026-03-15", updatedAt: "2026-04-30" });
    expect(d.warnings).toEqual([]);
  });
  it("parses a Cyclospora page with no status line and 'has ended' wording, including a 5-digit case count", () => {
    const d = parseOutbreakIndex(fixture("cdc/cyclospora-index.html"));
    expect(d).toMatchObject({ title: "Cyclospora Outbreak Linked to Iceberg Lettuce", status: "over", cases: 12883, hospitalizations: 570, deaths: 2, stateCount: 21, postedAt: "2026-07-14", updatedAt: "2026-09-11", declaredOverAt: "2026-09-11" });
    expect(d.warnings).toEqual([]);
  });
  it("reports warnings instead of inventing numbers when the page changes shape", () => {
    const d = parseOutbreakIndex("<html><head><title>Something | CDC</title></head><body><p>hello</p></body></html>");
    expect(d.cases).toBeNull();
    expect(d.status).toBe("unknown");
    expect(d.warnings).toEqual(expect.arrayContaining(["status", "cases", "hospitalizations", "deaths", "states", "postedAt"]));
  });
});

describe("CDC investigation page", () => {
  it("extracts illness onset range for an open outbreak", () => {
    const d = parseInvestigationPage(fixture("cdc/broccoli-sprouts-investigation.html"));
    expect(d.illnessOnsetFrom).toBe("2026-07-07");
    expect(d.illnessOnsetTo).toBe("2026-08-26");
    expect(d.declaredOverAt).toBeNull();
  });
  it("extracts the over date and prose totals for a closed outbreak", () => {
    const d = parseInvestigationPage(fixture("cdc/oysters-investigation.html"));
    expect(d).toMatchObject({ illnessOnsetFrom: "2025-06-21", illnessOnsetTo: "2025-12-22", declaredOverAt: "2026-02-24", cases: 80, stateCount: 23 });
  });
});

describe("CDC locations page and map config", () => {
  it("finds the map config URL", () => {
    expect(parseLocationsPage(fixture("cdc/broccoli-sprouts-locations.html"))).toBe("/salmonella/outbreaks/broccoli-sprouts-09-26/modules/map-broccoli-sprouts-sept-26.json");
  });
  it("parses per-state counts", () => {
    const states = parseMapConfig(JSON.parse(fixture("cdc/broccoli-sprouts-map.json")));
    expect(states).toEqual([{ state: "ID", cases: 1 }, { state: "MT", cases: 4 }, { state: "UT", cases: 1 }, { state: "WA", cases: 16 }]);
  });
  it("returns nothing rather than garbage for an unexpected config", () => {
    expect(parseMapConfig({})).toEqual([]);
    expect(parseMapConfig({ data: [{ foo: "bar" }] })).toEqual([]);
  });
});

describe("helpers", () => {
  it("builds stable ids", () => {
    expect(outbreakId("/salmonella/outbreaks/broccoli-sprouts-09-26/index.html")).toBe("cdc:salmonella/outbreaks/broccoli-sprouts-09-26");
  });
  it("maps pathogens to families", () => {
    expect(pathogenFamily("Salmonella Bovismorbificans")).toBe("Salmonella");
    expect(pathogenFamily("E. coli O26:H11, O103:H25, and O168:H8 and Salmonella Agona")).toBe("E. coli");
    expect(pathogenFamily("Listeria monocytogenes")).toBe("Listeria");
    expect(pathogenFamily("Clostridium botulinum")).toBe("Botulism");
    expect(pathogenFamily("Cyclospora")).toBe("Cyclospora");
    expect(pathogenFamily("Mystery germ")).toBe("Other");
  });
});

describe("archived (pre-2024 template) notice pages", () => {
  it("reads the one-line Fast Facts box, dates, and closed status", () => {
    const d = parseOutbreakIndex(fixture("cdc/archived-cake-mix-index.html"));
    expect(d).toMatchObject({ cases: 16, hospitalizations: 7, deaths: 0, stateCount: 12, recallIssued: false, status: "over", postedAt: "2021-07-28", updatedAt: "2021-09-16" });
    expect(d.warnings).toEqual([]);
  });
});

describe("notice id dates", () => {
  it("reads the month and year CDC encodes in notice ids", () => {
    const m = "/salmonella/thompson-10-23/index.html".match(/-(\d{2})-(\d{2})\/(?:index\.html?)?$/)!;
    expect(`20${m[2]}-${m[1]}-01`).toBe("2023-10-01");
  });
});
