// Shared shapes for everything the fetch job writes into data/.
// The website reads these files and nothing else.

export interface SourceStatus {
  /** Human-readable name shown on the site, e.g. "CDC multistate outbreak notices". */
  name: string;
  /** Where the data came from. Shown as the source link. */
  url: string;
  /** Last time this source was fetched successfully (ISO timestamp). Null if never. */
  fetchedAt: string | null;
  /** Whether the most recent attempt succeeded. When false, the site shows the last good data with a warning. */
  ok: boolean;
  /** Error message from the most recent attempt when ok is false. */
  error: string | null;
  /** Date or timestamp that the source itself claims for its data, when it gives one. */
  upstreamUpdated: string | null;
  /** How many items this source contributed in the last successful fetch. */
  itemCount: number | null;
}

export interface DataFile<T> {
  generatedAt: string;
  sources: Record<string, SourceStatus>;
  items: T[];
}

export type OutbreakStatus = "active" | "over" | "unknown";

export type PathogenFamily =
  | "Salmonella"
  | "E. coli"
  | "Listeria"
  | "Campylobacter"
  | "Cyclospora"
  | "Botulism"
  | "Hepatitis A"
  | "Vibrio"
  | "Shigella"
  | "Norovirus"
  | "Other";

export interface StateCount {
  state: string; // two-letter code
  cases: number;
}

export interface Outbreak {
  id: string;
  agency: "CDC";
  url: string;
  title: string;
  food: string;
  foodKeys: string[];
  pathogen: string;
  pathogenFamily: PathogenFamily;
  status: OutbreakStatus;
  cases: number | null;
  hospitalizations: number | null;
  deaths: number | null;
  stateCount: number | null;
  states: StateCount[];
  illnessOnsetFrom: string | null;
  illnessOnsetTo: string | null;
  postedAt: string | null;
  updatedAt: string | null;
  /** The date CDC declared the outbreak over, when stated. */
  declaredOverAt: string | null;
  recallIssued: boolean | null;
  year: number | null;
  fetchedAt: string;
  /** Fields we could not parse from the page. Non-empty means the CDC page changed shape. */
  parseWarnings: string[];
}

export interface ActiveInvestigationCounts {
  asOf: string | null;
  counts: Record<string, number>;
  total: number;
}

export interface OutbreaksFile extends DataFile<Outbreak> {
  activeInvestigationCounts: ActiveInvestigationCounts | null;
}

export type RecallAgency = "FDA" | "FSIS";
export type RecallCategory = "human-food" | "pet-food" | "dietary-supplement";
export type ReasonCategory =
  | "listeria"
  | "salmonella"
  | "ecoli"
  | "other-pathogen"
  | "undeclared-allergen"
  | "foreign-material"
  | "regulatory"
  | "other";

export interface Recall {
  id: string;
  agency: RecallAgency;
  /** Best page for a person to read: the FSIS notice, or the FDA recalls list searched by firm. */
  url: string;
  /** The machine-readable record this row was built from, when the human page is not the source. */
  sourceRecordUrl: string | null;
  title: string;
  firm: string;
  product: string;
  /** All product descriptions in the recall event (FDA lists one record per product). */
  products: string[];
  productCount: number;
  category: RecallCategory;
  foodKeys: string[];
  reason: string;
  reasonCategory: ReasonCategory;
  classification: "Class I" | "Class II" | "Class III" | null;
  status: string;
  states: string[] | null;
  distributionPattern: string | null;
  relatedToOutbreak: boolean | null;
  /** Date the firm began the recall (FDA recall_initiation_date / FSIS recall date). */
  recallDate: string | null;
  /** Date the agency posted it (FDA report_date; same as recallDate for FSIS). */
  reportDate: string | null;
  fetchedAt: string;
}

export type RecallsFile = DataFile<Recall>;

export interface StatusFile {
  generatedAt: string;
  sources: Record<string, SourceStatus>;
}

// ---------- News ----------

export type NewsKind = "news" | "agency-notice";

export interface NewsItem {
  id: string;
  /** Which feed this came from (stable key, e.g. "foodsafetynews"). */
  feed: string;
  /** Human-readable publisher, e.g. "Food Safety News" or "FDA recall notice". */
  source: string;
  kind: NewsKind;
  title: string;
  url: string;
  publishedAt: string; // ISO timestamp
  excerpt: string;
  fetchedAt: string;
}

export type NewsFile = DataFile<NewsItem>;

// ---------- Daily AI summary ----------

export interface SummarySource {
  n: number;
  kind: "news" | "agency-notice" | "outbreak" | "recall";
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
}

export interface SummaryFile {
  generatedAt: string | null;
  model: string | null;
  windowFrom: string | null;
  windowTo: string | null;
  paragraphs: string[];
  sources: SummarySource[];
  /** ok = generated fresh; cached = reused an earlier summary; skipped = no API key; failed = generation or validation failed. */
  status: "ok" | "cached" | "skipped" | "failed";
  note: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
}
