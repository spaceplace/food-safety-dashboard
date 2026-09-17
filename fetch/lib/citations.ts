// Every sentence of the AI summary must cite at least one listed source. These helpers
// check that, so a summary with an uncited or mis-cited claim is rejected, never published.

export function splitSentences(paragraph: string): string[] {
  // A sentence ends at . ! or ? that is followed by whitespace or the end, allowing
  // citations and closing quotes/parens to trail the punctuation.
  return paragraph
    .split(/(?<=[.!?]["')\]]*(?:\s*\[\d+(?:,\s*\d+)*\])*)\s+(?=[A-Z0-9"(])/)
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
