// Every sentence of the AI summary must cite at least one listed source. These helpers
// check that, so a summary with an uncited or mis-cited claim is rejected, never published.

// Periods that do not end a sentence. Recall notices are full of them: brand names like
// "J. HIGGS" and "EAT G.A.N.G.S.T.E.R.", firm names like "Smith Bros. Dairy". Splitting there
// tore a sentence away from its citation and got the whole brief rejected, so the guards below
// keep a break from landing after an initial, a dotted acronym, or a common abbreviation.
const ABBREVIATIONS = [
  "Inc", "Co", "Corp", "Cos", "Bros", "Ltd", "LLC", "LLP", "Mfg", "Dept", "Univ",
  "St", "Ste", "Ave", "Rd", "Blvd", "Mt", "Ft", "Dr", "Mr", "Mrs", "Ms", "Jr", "Sr",
  "No", "Nos", "vs", "etc", "approx", "est",
];

// A sentence ends at . ! or ? that is followed by whitespace and the start of a new sentence,
// allowing citations and closing quotes/parens to trail the punctuation.
const SENTENCE_BREAK = new RegExp(
  `(?<=[.!?]["')\\]]*(?:\\s*\\[\\d+(?:,\\s*\\d+)*\\])*)` + // ...after end punctuation, citations may trail
  `(?<!\\b[A-Za-z]\\.)` + // but not after a lone initial: "J. HIGGS", or the last letter of "G.A.N.G.S.T.E.R."
  `(?<!\\b(?:${ABBREVIATIONS.join("|")})\\.)` + // nor after a common abbreviation: "Smith Bros. Dairy"
  `\\s+(?=[A-Z0-9"(])`,
);

export function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(SENTENCE_BREAK)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function citationsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const part of m[1].split(",")) out.push(Number(part.trim()));
  }
  return out;
}

export interface CitationCheck {
  ok: boolean;
  problems: string[];
  cited: number[];
}

export function checkCitations(paragraphs: string[], sourceCount: number): CitationCheck {
  const problems: string[] = [];
  const cited = new Set<number>();
  if (paragraphs.length === 0) problems.push("summary is empty");
  for (const [pi, paragraph] of paragraphs.entries()) {
    for (const sentence of splitSentences(paragraph)) {
      const nums = citationsIn(sentence);
      if (nums.length === 0) problems.push(`paragraph ${pi + 1}: uncited sentence: "${sentence.slice(0, 80)}"`);
      for (const n of nums) {
        if (n < 1 || n > sourceCount) problems.push(`paragraph ${pi + 1}: citation [${n}] does not exist (only ${sourceCount} sources)`);
        else cited.add(n);
      }
    }
  }
  return { ok: problems.length === 0, problems, cited: [...cited].sort((a, b) => a - b) };
}
