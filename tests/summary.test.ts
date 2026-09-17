import { describe, expect, it } from "vitest";
import { checkCitations, citationsIn, splitSentences } from "../fetch/lib/citations.js";
import { buildSources, buildUserPrompt, splitParagraphs, type SummaryInputs } from "../fetch/summarize.js";

describe("citation check", () => {
  it("accepts a fully cited paragraph", () => {
    const r = checkCitations(["Eggs were recalled in 12 states [1]. CDC says the outbreak is over [2][3]. Consumers should throw them out [1, 3]."], 3);
    expect(r.ok).toBe(true);
    expect(r.cited).toEqual([1, 2, 3]);
  });
  it("rejects an uncited sentence", () => {
    const r = checkCitations(["Eggs were recalled [1]. This is very bad."], 1);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/uncited sentence/);
  });
  it("rejects a citation that points nowhere", () => {
    const r = checkCitations(["Eggs were recalled [9]."], 3);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/\[9\] does not exist/);
  });
  it("rejects an empty summary", () => {
    expect(checkCitations([], 3).ok).toBe(false);
  });
  it("does not split on abbreviations inside citations or decimals", () => {
    expect(splitSentences("About 3.5 million pounds were recalled [1]. The U.S. firm said so [2].")).toHaveLength(2);
    expect(citationsIn("[2][7] and [1, 4]")).toEqual([2, 7, 1, 4]);
  });
});

describe("summary inputs", () => {
  const inputs: SummaryInputs = {
    windowFrom: "2026-09-09", windowTo: "2026-09-16",
    news: [
      { id: "a", feed: "foodsafetynews", source: "Food Safety News", kind: "news", title: "Old story", url: "https://x/old", publishedAt: "2026-08-01T00:00:00Z", excerpt: "old", fetchedAt: "t" },
      { id: "b", feed: "fda-recalls", source: "FDA recall notice", kind: "agency-notice", title: "Firm recalls thing", url: "https://x/fda", publishedAt: "2026-09-15T00:00:00Z", excerpt: "because", fetchedAt: "t" },
      { id: "c", feed: "google-news", source: "Outlet", kind: "news", title: "News story", url: "https://x/news", publishedAt: "2026-09-14T00:00:00Z", excerpt: "text", fetchedAt: "t" },
    ],
    outbreaks: [{ id: "o", agency: "CDC", url: "https://cdc/o", title: "Salmonella Outbreak Linked to Sprouts", food: "Sprouts", foodKeys: ["sprouts"], pathogen: "Salmonella", pathogenFamily: "Salmonella", status: "active", cases: 22, hospitalizations: 2, deaths: 0, stateCount: 4, states: [], illnessOnsetFrom: null, illnessOnsetTo: null, postedAt: "2026-09-09", updatedAt: "2026-09-11", declaredOverAt: null, recallIssued: true, year: 2026, fetchedAt: "t", parseWarnings: [] }],
    recalls: [{ id: "r", agency: "FSIS", url: "https://fsis/r", sourceRecordUrl: null, title: "Acme recalls beef", firm: "Acme", product: "Ground beef", products: ["Ground beef"], productCount: 1, category: "human-food", foodKeys: ["beef"], reason: "E. coli", reasonCategory: "ecoli", classification: "Class I", status: "Active Recall", states: ["TX"], distributionPattern: null, relatedToOutbreak: false, recallDate: "2026-09-12", reportDate: "2026-09-12", fetchedAt: "t" }],
  };
  it("numbers sources with agency material first and drops items outside the window", () => {
    const { sources, lines } = buildSources(inputs);
    expect(sources.map((s) => s.kind)).toEqual(["outbreak", "recall", "agency-notice", "news"]);
    expect(sources.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    expect(sources.find((s) => s.title === "Old story")).toBeUndefined();
    expect(lines[0]).toMatch(/^\[1\] \(outbreak; CDC outbreak notice; 2026-09-11\) Salmonella Outbreak Linked to Sprouts/);
    expect(lines[1]).toMatch(/Class I\. Firm: Acme/);
  });
  it("builds a prompt containing the window and every source line", () => {
    const { lines } = buildSources(inputs);
    const prompt = buildUserPrompt(inputs, lines);
    expect(prompt).toContain("2026-09-09 to 2026-09-16");
    expect(prompt).toContain("[4] (news; Outlet; 2026-09-14) News story");
  });
  it("splits model output into clean paragraphs", () => {
    expect(splitParagraphs("One [1].\n\nTwo\nlines [2].\n\n\n")).toEqual(["One [1].", "Two lines [2]."]);
  });
});
