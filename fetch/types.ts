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
  /** Who started the recall, as the agency words it (FDA "Voluntary: Firm initiated" / "FDA Mandated"). FSIS recalls are voluntary; null there. */
  initiatedBy: string | null;
  /** How the firm first told its customers (FDA initial_firm_notification: "Press Release", "E-Mail", ...). Null for FSIS. */
  notificationMethod: string | null;
  /** FSIS press-release text, HTML stripped and truncated; it says how the problem was found. Null for FDA. */
  summary: string | null;
  /** FDA termination_date. FSIS gives only a closed year, kept in closedYear. */
  closedDate: string | null;
  closedYear: string | null;
  /** When the agency last touched the record (FSIS last modified date, FDA center classification date). */
  agencyUpdatedAt: string | null;
  /** FSIS processing category ("Fully Cooked - Not Shelf Stable"). Null for FDA. */
  processing: string[] | null;
  /** Recalling firm's city and state when given. */
  firmLocation: string | null;
  fetchedAt: string;
}

export type RecallsFile = DataFile<Recall>;

// ---------- Signals (the Signal Explorer dataset) ----------
// One record per recall, public health alert, or outbreak notice, classified with a fixed
// set of categories. Built from the outbreak and recall items above by fetch/signals/build.ts.
// Every derived label carries the agency's own wording next to it and a note of whether it
// was stated by the agency, coded by the agency, or inferred by our rules.

export type SignalKind = "recall" | "public-health-alert" | "outbreak";
export type SignalSource = "CDC" | "FDA" | "FSIS";

export type HazardType = "biological" | "allergen" | "physical" | "chemical" | "labeling-regulatory" | "other" | "undetermined";
export type AgentGroup = "organism" | "allergen" | "physical" | "chemical";
export interface SignalAgent {
  name: string;
  group: AgentGroup;
}

export type ProductCategory =
  | "produce"
  | "meat"
  | "poultry"
  | "seafood"
  | "dairy"
  | "eggs"
  | "nuts-and-seeds"
  | "grains-and-bakery"
  | "snacks-and-confectionery"
  | "prepared-foods"
  | "condiments-and-spices"
  | "beverages"
  | "infant-and-baby"
  | "pet-food"
  | "other";

export type GeoScope = "nationwide" | "multi-state" | "single-state" | "international" | "unspecified";

export type RootCause =
  | "labeling-or-packaging-error"
  | "supplier-ingredient"
  | "process-deviation"
  | "equipment-failure"
  | "sanitation-or-facility"
  | "import-or-inspection-violation"
  | "not-stated";

/** How a classification was arrived at. "agency-coded" = the agency supplies a coded value; "inferred" = our keyword rules on free text. */
export type Basis = "agency-coded" | "inferred" | "not-stated";

export type Detection =
  | "consumer-complaint"
  | "illness-report-or-outbreak"
  | "firm-self-reported"
  | "other-agency-or-partner"
  | "agency-sampling-or-inspection"
  | "not-stated";

export type CorrectiveAction =
  | "voluntary-recall"
  | "mandated-recall"
  | "public-health-alert"
  | "investigation-with-recall"
  | "investigation-without-recall"
  | "investigation"
  | "unknown";

export type NormalizedStatus = "open" | "closed" | "unknown";

export interface Signal {
  /** Same id as the outbreak or recall it was built from ("fda:99646", "fsis:021-2026", "cdc:..."). */
  id: string;
  /** URL-safe form of the id, used for the record's page. */
  slug: string;
  kind: SignalKind;
  source: SignalSource;
  /** The agency's own identifier: openFDA event id, FSIS recall number, or CDC notice path. */
  sourceId: string;
  title: string;
  url: string;
  sourceRecordUrl: string | null;
  firm: string | null;
  product: string;
  productCategory: ProductCategory;
  foodKeys: string[];
  hazardType: HazardType;
  agents: SignalAgent[];
  classification: "Class I" | "Class II" | "Class III" | null;
  geography: {
    scope: GeoScope;
    states: string[];
    stateCount: number | null;
    international: boolean;
    /** The agency's own distribution wording, when it gives one. */
    description: string | null;
  };
  rootCause: { category: RootCause; basis: Basis; detail: string | null };
  detection: { category: Detection; basis: Basis; detail: string | null };
  correctiveAction: { category: CorrectiveAction; detail: string | null };
  status: { normalized: NormalizedStatus; agency: string };
  dates: {
    /** When the event began: recall initiation date, or the date CDC posted the outbreak notice. */
    event: string | null;
    /** When the agency published it. */
    reported: string | null;
    /** When the agency last updated it, if it says. */
    updated: string | null;
    closed: string | null;
  };
  outbreak: {
    pathogen: string;
    cases: number | null;
    hospitalizations: number | null;
    deaths: number | null;
    illnessOnsetFrom: string | null;
    illnessOnsetTo: string | null;
  } | null;
  relatedToOutbreak: boolean | null;
  /** The agency's own reason wording, unchanged. */
  reasonText: string | null;
  /** Fields the source did not provide. */
  missing: string[];
  /** Fields whose value was assigned by our rules rather than stated by the agency. */
  inferred: string[];
  rulesVersion: string;
  record: {
    /** First time our job saw this record. On the initial load this is the load time, and backfilled is true. */
    firstSeen: string;
    lastChanged: string;
    /** How many times a tracked field has changed since first seen. */
    revisions: number;
    backfilled: boolean;
  };
}

export interface SignalsFile {
  generatedAt: string;
  rulesVersion: string;
  /** Records reported before this date are not kept. */
  windowStart: string;
  sources: Record<string, SourceStatus>;
  items: Signal[];
}

export type ChangeKind = "initial-load" | "added" | "updated" | "closed" | "reopened" | "removed";

export interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface ChangeLogEntry {
  at: string;
  change: ChangeKind;
  id: string | null;
  slug: string | null;
  title: string | null;
  source: SignalSource | null;
  fields: FieldChange[];
  /** For initial-load: how many records were loaded. */
  count: number | null;
  note: string | null;
}

export interface ChangeLogFile {
  generatedAt: string;
  entries: ChangeLogEntry[];
}

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
