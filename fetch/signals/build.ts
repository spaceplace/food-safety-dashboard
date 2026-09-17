// Turns outbreak and recall items into Signal records, then compares them with the previous
// signals file to produce the change log. Pure: no fetching, no clock reads except the `now`
// passed in, so a rerun on unchanged inputs produces byte-identical records.

import type {
  ChangeKind, ChangeLogEntry, ChangeLogFile, FieldChange, Outbreak, Recall, Signal, SignalsFile, SourceStatus,
} from "../types.js";
import { RULES_VERSION } from "./taxonomy.js";
import {
  correctiveActionFor, detectAgents, detectionFor, hazardTypeFor, parseDistribution, productCategoryFor, rootCauseFor, slugify, statusFor,
} from "./classify.js";

// ---------- Mapping ----------

export function signalFromRecall(r: Recall): Signal {
  const isAlert = /public health alert/i.test(r.status);
  const reasonText = r.reason || null;
  // Reason wording first, then the title (FSIS titles name the hazard), then the press-release summary.
  const hazardText = [r.reason, r.title, r.summary ?? ""].join(" \n ");
  const agents = detectAgents(hazardText);
  const hazardType = hazardTypeFor(agents, hazardText);
  const productText = [r.title, ...r.products, r.product].join(" \n ");
  const productCategory = productCategoryFor(productText, r.category === "pet-food");
  const dist = parseDistribution(r.distributionPattern, r.states);
  const fsisCodes = r.agency === "FSIS" && r.reason ? r.reason.split(";").map((s) => s.trim()) : null;
  const causeText = [r.reason, r.summary ?? ""].join(" \n ");
  const rootCause = rootCauseFor(causeText, fsisCodes);
  const detection = detectionFor(r.summary ?? r.reason, false);
  const corrective = correctiveActionFor({ source: r.agency, agencyStatus: r.status, initiatedBy: r.initiatedBy, notificationMethod: r.notificationMethod, recallIssued: null });
  const status = statusFor({ source: r.agency, agencyStatus: r.status, closedYear: r.closedYear });

  const missing: string[] = [];
  const inferred: string[] = [];
  if (!r.reason) missing.push("reason");
  if (!r.classification) missing.push("classification");
  if (!r.firm) missing.push("firm");
  if (!r.distributionPattern && (!r.states || r.states.length === 0)) missing.push("distribution");
  if (!r.recallDate) missing.push("eventDate");
  if (!r.closedDate && status.normalized === "closed") missing.push(r.closedYear ? "closedDate (year only)" : "closedDate");
  if (!r.agencyUpdatedAt) missing.push("updatedDate");
  if (r.agency === "FDA" && detection.category === "not-stated") missing.push("detection (FDA enforcement reports rarely say how a problem was found)");
  if (r.status === "unknown") missing.push("status");
  inferred.push("hazardType", "agents", "productCategory");
  if (r.agency === "FDA" && r.distributionPattern) inferred.push("geography");
  if (rootCause.basis === "inferred") inferred.push("rootCause");
  if (detection.basis === "inferred") inferred.push("detection");

  return {
    id: r.id,
    slug: slugify(r.id),
    kind: isAlert ? "public-health-alert" : "recall",
    source: r.agency,
    sourceId: r.id.replace(/^[a-z]+:/, ""),
    title: r.title,
    url: r.url,
    sourceRecordUrl: r.sourceRecordUrl,
    firm: r.firm || null,
    product: r.product,
    productCategory,
    foodKeys: r.foodKeys,
    hazardType,
    agents,
    classification: r.classification,
    geography: {
      scope: dist.scope,
      states: dist.states,
      stateCount: dist.states.length || null,
      international: dist.international,
      description: r.distributionPattern ?? (r.states && r.states.length ? r.states.join(", ") : null),
    },
    rootCause,
    detection,
    correctiveAction: corrective,
    status,
    dates: { event: r.recallDate, reported: r.reportDate, updated: r.agencyUpdatedAt, closed: r.closedDate },
    outbreak: null,
    relatedToOutbreak: r.relatedToOutbreak,
    reasonText,
    missing,
    inferred,
    rulesVersion: RULES_VERSION,
    record: { firstSeen: "", lastChanged: "", revisions: 0, backfilled: false },
  };
}

export function signalFromOutbreak(o: Outbreak): Signal {
  const agents = detectAgents(o.pathogen);
  if (agents.length === 0) agents.push({ name: o.pathogen || "Unspecified microbial", group: "organism" });
  const productCategory = productCategoryFor(o.food, false);
  const states = o.states.map((s) => s.state).sort();
  const status = statusFor({ source: "CDC", agencyStatus: o.status });
  const missing: string[] = [];
  if (o.cases === null) missing.push("cases");
  if (o.hospitalizations === null) missing.push("hospitalizations");
  if (o.deaths === null) missing.push("deaths");
  if (states.length === 0) missing.push("states");
  if (!o.postedAt) missing.push("reportedDate");
  if (o.recallIssued === null) missing.push("recallIssued");
  if (status.normalized === "closed" && !o.declaredOverAt) missing.push("closedDate");
  missing.push("rootCause (CDC notices describe the contaminated food, not why it was contaminated)");
  return {
    id: o.id,
    slug: slugify(o.id),
    kind: "outbreak",
    source: "CDC",
    sourceId: o.id.replace(/^cdc:/, ""),
    title: o.title,
    url: o.url,
    sourceRecordUrl: null,
    firm: null,
    product: o.food,
    productCategory,
    foodKeys: o.foodKeys,
    hazardType: "biological",
    agents,
    classification: null,
    geography: {
      scope: states.length >= 2 ? "multi-state" : states.length === 1 ? "single-state" : "unspecified",
      states,
      stateCount: o.stateCount ?? (states.length || null),
      international: false,
      description: o.stateCount !== null ? `${o.stateCount} states` : null,
    },
    rootCause: { category: "not-stated", basis: "not-stated", detail: null },
    detection: detectionFor("", true),
    correctiveAction: correctiveActionFor({ source: "CDC", agencyStatus: o.status, initiatedBy: null, notificationMethod: null, recallIssued: o.recallIssued }),
    status,
    dates: { event: o.postedAt, reported: o.postedAt, updated: o.updatedAt, closed: o.declaredOverAt },
    outbreak: {
      pathogen: o.pathogen,
      cases: o.cases,
      hospitalizations: o.hospitalizations,
      deaths: o.deaths,
      illnessOnsetFrom: o.illnessOnsetFrom,
      illnessOnsetTo: o.illnessOnsetTo,
    },
    relatedToOutbreak: true,
    reasonText: null,
    missing,
    inferred: ["productCategory"],
    rulesVersion: RULES_VERSION,
    record: { firstSeen: "", lastChanged: "", revisions: 0, backfilled: false },
  };
}

// ---------- Change detection ----------

/** The fields whose changes are worth logging. Each maps to a short string for comparison and display. */
const TRACKED: Array<[field: string, get: (s: Signal) => string | null]> = [
  ["status", (s) => s.status.normalized],
  ["agency status", (s) => s.status.agency],
  ["classification", (s) => s.classification],
  ["hazard type", (s) => s.hazardType],
  ["agents", (s) => s.agents.map((a) => a.name).join(", ") || null],
  ["product category", (s) => s.productCategory],
  ["root cause", (s) => s.rootCause.category],
  ["detection", (s) => s.detection.category],
  ["corrective action", (s) => s.correctiveAction.category],
  ["geography", (s) => s.geography.scope],
  ["states", (s) => s.geography.states.join(", ") || null],
  ["updated date", (s) => s.dates.updated],
  ["closed date", (s) => s.dates.closed],
  ["cases", (s) => (s.outbreak?.cases ?? null)?.toString() ?? null],
  ["hospitalizations", (s) => (s.outbreak?.hospitalizations ?? null)?.toString() ?? null],
  ["deaths", (s) => (s.outbreak?.deaths ?? null)?.toString() ?? null],
  ["firm", (s) => s.firm],
  ["product", (s) => s.product],
  ["reason", (s) => s.reasonText],
  ["rules version", (s) => s.rulesVersion],
];

export function diffSignals(prev: Signal, next: Signal): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, get] of TRACKED) {
    const a = get(prev);
    const b = get(next);
    if (a !== b) out.push({ field, from: a, to: b });
  }
  return out;
}

export interface BuildInput {
  outbreaks: Outbreak[];
  recalls: Recall[];
  /** Signals from the previous run whose source failed this time; kept unchanged. */
  carryOver: Signal[];
  previous: SignalsFile | null;
  previousLog: ChangeLogFile | null;
  sources: Record<string, SourceStatus>;
  now: string;
  /** ISO day; records reported before it are dropped. */
  windowStart: string;
}

const LOG_MAX_ENTRIES = 5000;
const LOG_MAX_AGE_DAYS = 400;

export function buildSignals(input: BuildInput): { file: SignalsFile; log: ChangeLogFile } {
  const { now, windowStart } = input;
  const inWindow = (s: Signal) => {
    const d = s.dates.reported ?? s.dates.event;
    return d === null || d >= windowStart;
  };
  const fresh = [...input.recalls.map(signalFromRecall), ...input.outbreaks.map(signalFromOutbreak)].filter(inWindow);
  const carried = input.carryOver.filter(inWindow);
  const prevById = new Map((input.previous?.items ?? []).map((s) => [s.id, s]));
  const initial = input.previous === null;
  const entries: ChangeLogEntry[] = [];

  const items: Signal[] = [];
  const seen = new Set<string>();
  for (const s of fresh) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const prev = prevById.get(s.id);
    if (!prev) {
      s.record = { firstSeen: now, lastChanged: now, revisions: 0, backfilled: initial };
      if (!initial) entries.push(entry(now, "added", s, []));
      items.push(s);
      continue;
    }
    const changes = diffSignals(prev, s);
    if (changes.length === 0) {
      s.record = prev.record;
    } else {
      s.record = { ...prev.record, lastChanged: now, revisions: prev.record.revisions + 1 };
      const kind: ChangeKind =
        prev.status.normalized !== "closed" && s.status.normalized === "closed" ? "closed"
        : prev.status.normalized === "closed" && s.status.normalized === "open" ? "reopened"
        : "updated";
      const rulesChanged = prev.rulesVersion !== s.rulesVersion;
      entries.push(entry(now, kind, s, changes, rulesChanged ? `Reclassified under rules ${s.rulesVersion} (was ${prev.rulesVersion})` : null));
    }
    items.push(s);
  }
  for (const s of carried) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    items.push(s);
  }
  // A record that was inside the window last time and is now gone from a source that fetched fine.
  const carriedSources = new Set(carried.map((s) => s.source));
  for (const prev of prevById.values()) {
    if (seen.has(prev.id) || carriedSources.has(prev.source) || !inWindow(prev)) continue;
    entries.push(entry(now, "removed", prev, [], "No longer returned by the source"));
  }
  if (initial) {
    entries.push({ at: now, change: "initial-load", id: null, slug: null, title: null, source: null, fields: [], count: items.length, note: `First build of the signals dataset from records reported since ${windowStart}. Records loaded here are marked as backfilled: their first-seen time is the load time, not the agency's posting date.` });
  }

  items.sort((a, b) => (b.dates.reported ?? "").localeCompare(a.dates.reported ?? "") || a.id.localeCompare(b.id));

  const cutoff = new Date(new Date(now).getTime() - LOG_MAX_AGE_DAYS * 86_400_000).toISOString();
  const previousEntries = (input.previousLog?.entries ?? []).filter((e) => e.at >= cutoff);
  const log: ChangeLogFile = { generatedAt: now, entries: [...entries, ...previousEntries].slice(0, LOG_MAX_ENTRIES) };
  const file: SignalsFile = { generatedAt: now, rulesVersion: RULES_VERSION, windowStart, sources: input.sources, items };
  return { file, log };
}

function entry(at: string, change: ChangeKind, s: Signal, fields: FieldChange[], note: string | null = null): ChangeLogEntry {
  return { at, change, id: s.id, slug: s.slug, title: s.title, source: s.source, fields, count: null, note };
}
