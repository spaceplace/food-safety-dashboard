// Keyword rules that turn agency free text into the fixed categories in taxonomy.ts.
// Every function here is pure and tested against saved agency wording in tests/signals.test.ts.
// The rules are deliberately simple and readable: a person should be able to look at a
// record's original text and see why it got its label.

import { STATE_CODES } from "../lib/states.js";
import type {
  AgentGroup, Basis, CorrectiveAction, Detection, GeoScope, HazardType, NormalizedStatus, ProductCategory, RootCause, SignalAgent,
} from "../types.js";

// ---------- Organisms, allergens, foreign materials, chemicals ----------

interface AgentRule {
  name: string;
  group: AgentGroup;
  pattern: RegExp;
}

const ORGANISMS: AgentRule[] = [
  { name: "Listeria monocytogenes", group: "organism", pattern: /listeria/i },
  { name: "Salmonella", group: "organism", pattern: /salmonella/i },
  { name: "E. coli (STEC)", group: "organism", pattern: /\be\.? ?coli\b|\bstec\b|shiga[- ]toxin/i },
  { name: "Hepatitis A", group: "organism", pattern: /hepatitis a\b/i },
  { name: "Norovirus", group: "organism", pattern: /norovirus/i },
  { name: "Clostridium botulinum", group: "organism", pattern: /botul|c\.? ?botulinum|uneviscerated/i },
  { name: "Cyclospora", group: "organism", pattern: /cyclospora/i },
  { name: "Cronobacter", group: "organism", pattern: /cronobacter/i },
  { name: "Campylobacter", group: "organism", pattern: /campylobacter/i },
  { name: "Vibrio", group: "organism", pattern: /vibrio/i },
  { name: "Shigella", group: "organism", pattern: /shigella/i },
  { name: "Staphylococcus", group: "organism", pattern: /staph/i },
  { name: "Bacillus cereus", group: "organism", pattern: /bacillus/i },
  { name: "Clostridium perfringens", group: "organism", pattern: /perfringens/i },
  { name: "Mold or yeast", group: "organism", pattern: /\bmold\b|\bmoldy\b|\byeast\b|fungal/i },
];
const UNSPECIFIED_MICROBIAL = /microbial|microbiological|pathogen|bacteria|underprocess|under-process|pasteuriz|temperature abuse|spoil|insanitary|unsanitary|coliform|aerobic plate|enterobacter|\bvirus\b|parasite/i;

const ALLERGEN_CUE = /undeclared|not declared|allergen|allerg|contains?\b|declar|label|ingredient statement|may contain/i;
const ALLERGENS: AgentRule[] = [
  { name: "Milk", group: "allergen", pattern: /\bmilk\b|\bdairy\b|\bwhey\b|casein|lactose|\bbutter\b|\bcheese\b|\bcream\b/i },
  { name: "Egg", group: "allergen", pattern: /\beggs?\b|albumen/i },
  { name: "Peanut", group: "allergen", pattern: /peanut/i },
  { name: "Tree nuts", group: "allergen", pattern: /tree ?nuts?|almond|walnut|cashew|pecan|pistachio|hazelnut|macadamia|brazil nut|pine nut|coconut/i },
  { name: "Wheat or gluten", group: "allergen", pattern: /\bwheat\b|gluten/i },
  { name: "Soy", group: "allergen", pattern: /\bsoy/i },
  { name: "Fish", group: "allergen", pattern: /\bfish\b|anchov|\bcod\b|salmon|\btuna\b/i },
  { name: "Shellfish", group: "allergen", pattern: /shellfish|crustacean|shrimp|\bcrab\b|lobster|mollus|oyster|\bclams?\b/i },
  { name: "Sesame", group: "allergen", pattern: /sesame/i },
  { name: "Sulfites", group: "allergen", pattern: /sulfite|sulphite|sulfur dioxide/i },
  { name: "Mustard", group: "allergen", pattern: /mustard/i },
];

const PHYSICAL: AgentRule[] = [
  { name: "Metal", group: "physical", pattern: /\bmetal|\bsteel\b|\bwire\b/i },
  { name: "Plastic or rubber", group: "physical", pattern: /plastic|rubber|polyethylene|nylon|\bfilm\b/i },
  { name: "Glass", group: "physical", pattern: /\bglass\b/i },
  { name: "Wood", group: "physical", pattern: /\bwood(en)?\b/i },
  { name: "Bone, shell, or pit fragments", group: "physical", pattern: /\bbone|shell fragment|pit fragment|\bpits?\b|\bstones?\b/i },
  { name: "Insects or pests", group: "physical", pattern: /insect|rodent|\bpests?\b|infest/i },
];
const UNSPECIFIED_FOREIGN = /foreign (material|object|matter|body)|extraneous/i;

const CHEMICAL: AgentRule[] = [
  { name: "Lead", group: "chemical", pattern: /\blead\b/i },
  { name: "Other heavy metals", group: "chemical", pattern: /cadmium|arsenic|mercury|heavy metal/i },
  { name: "Pesticide residue", group: "chemical", pattern: /pesticide|herbicide|fungicide|chlorpyrifos/i },
  { name: "Unapproved additive or color", group: "chemical", pattern: /unapproved|not (an )?approved|color additive|colour additive|fd&c|\bdye\b|red (3|no\. ?3|40)|cyclamate|partially hydrogenated|\bphos?\b|erucic|not permitted (for use )?in food|non-?permitted/i },
  { name: "Cleaning chemical or sanitizer", group: "chemical", pattern: /sanitizer|cleaning (agent|solution|chemical|compound)|detergent|\bammonia\b|\bbleach\b/i },
  { name: "Mycotoxin", group: "chemical", pattern: /aflatoxin|mycotoxin|vomitoxin|patulin|ochratoxin/i },
  { name: "Histamine", group: "chemical", pattern: /histamine|scombro/i },
  { name: "Ethylene oxide", group: "chemical", pattern: /ethylene oxide/i },
  { name: "Drug or veterinary residue", group: "chemical", pattern: /nitrofuran|chloramphenicol|veterinary drug|drug residue|antibiotic|malachite green|sulfonamide/i },
  { name: "Radioactive contamination", group: "chemical", pattern: /cesium|\bcs-?137\b|radioact|radionuclide/i },
];
const UNSPECIFIED_CHEMICAL = /\bchemical|\btoxin|nitrite|melamine|hydrocarbon|solvent|elevated levels?|high levels? of|adulterat/i;

/** Every organism, allergen, foreign material, or chemical the text names. Empty when none. */
export function detectAgents(text: string): SignalAgent[] {
  const out: SignalAgent[] = [];
  const t = text ?? "";
  for (const r of ORGANISMS) if (r.pattern.test(t)) out.push({ name: r.name, group: r.group });
  if (!out.some((a) => a.group === "organism") && UNSPECIFIED_MICROBIAL.test(t)) out.push({ name: "Unspecified microbial", group: "organism" });

  if (ALLERGEN_CUE.test(t)) {
    const before = out.length;
    for (const r of ALLERGENS) if (r.pattern.test(t)) out.push({ name: r.name, group: r.group });
    if (out.length === before && /undeclared|allergen/i.test(t)) out.push({ name: "Unspecified allergen", group: "allergen" });
  }

  const physicalBefore = out.length;
  for (const r of PHYSICAL) if (r.pattern.test(t)) out.push({ name: r.name, group: r.group });
  if (out.length === physicalBefore && UNSPECIFIED_FOREIGN.test(t)) out.push({ name: "Unspecified foreign material", group: "physical" });

  const chemicalBefore = out.length;
  for (const r of CHEMICAL) if (r.pattern.test(t)) out.push({ name: r.name, group: r.group });
  if (out.length === chemicalBefore && UNSPECIFIED_CHEMICAL.test(t) && out.length === 0) out.push({ name: "Unspecified chemical", group: "chemical" });
  return out;
}

const REGULATORY = /import violation|without (the )?benefit of (federal )?inspection|misbrand|mislabel|inaccurately declared|ineligible|not eligible|no (usda )?mark of inspection|labell?ing|labell?ed as|incorrect(ly)? labell?ed|misprint|nutrition facts|ingredient list|failed to (meet|comply)|not (in )?complian|unapproved (source|establishment)|process authority|scheduled process|species substitution|is actually|substitut|not registered|without (a |the )?(required )?(permit|license|registration)/i;
const OTHER_PROBLEM = /unfit|spoil|packag(e|ing) (defect|failure|integrity)|swollen|leak|seal|processing defect|off[- ]odor|off[- ]taste|quality|damaged|expired|past (its )?(shelf|expiration|best)|subpotent|superpotent|potency|lumps|texture|sticky|discolor/i;

/** Hazard type follows from the agents; regulatory and "other" apply only when no agent is named. */
export function hazardTypeFor(agents: SignalAgent[], text: string): HazardType {
  const groups = new Set(agents.map((a) => a.group));
  if (groups.has("organism")) return "biological";
  if (groups.has("allergen")) return "allergen";
  if (groups.has("physical")) return "physical";
  if (groups.has("chemical")) return "chemical";
  if (REGULATORY.test(text)) return "labeling-regulatory";
  if (OTHER_PROBLEM.test(text)) return "other";
  return "undetermined";
}

// ---------- Product category ----------

const PRODUCT_RULES: Array<[ProductCategory, RegExp]> = [
  ["infant-and-baby", /\binfant|\bbaby\b|toddler|\bformula\b/i],
  ["prepared-foods", /ready[- ]to[- ]eat|sandwich|\bsalads?\b(?! dressing)|\bmeals?\b|entr[ée]es?|\bbowls?\b|burrito|pizza|\bwraps?\b|sushi|\bsoups?\b|\bdips?\b|hummus|guacamole|frozen dinner|meal kit|taquito|empanada|dumpling|lasagna|casserole|\bkits?\b|quesadilla|enchilada|pot pie|\bsalsa\b/i],
  ["seafood", /\bfish\b|salmon|\btuna\b|tilapia|\bcod\b|shrimp|\bcrab\b|lobster|oyster|\bclams?\b|mussel|scallop|shellfish|seafood|squid|calamari|octopus|anchov|sardine|herring|mackerel|snapper|caviar|\broe\b|crawfish|crayfish|\beel\b|surimi/i],
  ["poultry", /chicken|turkey|poultry|\bduck\b|\bhens?\b|\bquail\b/i],
  ["meat", /\bbeef\b|\bpork\b|\bham\b|bacon|sausage|\blamb\b|\bveal\b|bison|jerky|hot dogs?|frankfurter|salami|pepperoni|\bmeat\b|steak|brisket|chorizo|\bdeli\b|prosciutto|pastrami|bologna|\bribs?\b|carnitas|chicharr|pork rind|crackling/i],
  ["eggs", /\beggs?\b/i],
  ["nuts-and-seeds", /peanut|groundnut|almond|cashew|pistachio|walnut|pecan|hazelnut|macadamia|nut butter|tahini|\bnuts?\b|sesame|sunflower|\bchia\b|\bflax|\bseeds?\b/i],
  ["dairy", /\bmilk\b(?! chocolate)|cheese|queso|yogurt|yoghurt|ice cream|gelato|sour cream|cream cheese|whipped cream|\bdairy\b|kefir|\bbutter\b|\bcream\b|\bcurd|custard/i],
  ["produce", /lettuce|romaine|spinach|kale|arugula|leafy green|sprouts?|tomato|pepper|jalape[nñ]o|onion|cucumber|cantaloupe|melon|watermelon|berr(y|ies)|peach|nectarine|plum|apricot|cherr|apple|avocado|mushroom|enoki|basil|cilantro|parsley|\bherbs?\b|mango|papaya|pineapple|grape|citrus|orange|lemon|lime|banana|potato|carrot|broccoli|cauliflower|cabbage|celery|artichoke|\bcorn\b|\bpeas\b|beans?\b|squash|zucchini|garlic|ginger|kimchi|sauerkraut|vegetable|fruit|produce/i],
  ["grains-and-bakery", /\bflour\b|\bdough\b|cake mix|baking mix|cereal|granola|\boats?\b|oatmeal|\bbread\b|bagel|muffin|\bcakes?\b|pastr|donut|doughnut|bakery|cookie|cannoli|dessert|\bpasta\b|noodle|\brice\b|tortilla|cracker|biscuit|waffle|pancake|pie\b|brownie/i],
  ["snacks-and-confectionery", /\bchips?\b|candy|candies|chocolate|\bgum\b|popcorn|pretzel|snack|puffs|confection|marshmallow|lollipop|gummies|gummy|licorice|toffee|caramel|\bbar\b|trail mix|crunch/i],
  ["condiments-and-spices", /\bspices?\b|seasoning|\bsauces?\b|dressing|\branch\b|condiment|ketchup|mayonnaise|vinegar|\boils?\b|honey|syrup|\bjam\b|jelly|\bsugar\b|\bsalt\b|extract|flavor|paprika|cinnamon|curry|cumin|turmeric|pepper flakes|marinade|relish|pickle|\bmiso\b|\bpaste\b/i],
  ["beverages", /juice|smoothie|cider|kombucha|beverage|\bdrinks?\b|\bwater\b|\bsoda\b|coffee|cold brew|\btea\b|lemonade|\bmilk\b|energy (drink|support)|\bshake\b/i],
];

/**
 * One primary category per record from the product wording. The first matching rule wins, so
 * the list is ordered from most specific (infant, prepared foods) to most general (beverages).
 */
export function productCategoryFor(text: string, isPetFood: boolean): ProductCategory {
  if (isPetFood) return "pet-food";
  for (const [cat, re] of PRODUCT_RULES) if (re.test(text)) return cat;
  return "other";
}

// ---------- Geography ----------

const NATIONWIDE = /nation-?wide|national(ly)?\b|throughout the (u\.?s\.?a?\.?|united states|country|nation)|all 50 states|across the (u\.?s\.?a?\.?|united states|country|nation)|entire (u\.?s\.?a?\.?|united states|country)|\bus[- ]wide|continental (us|united states)|50 states/i;
const INTERNATIONAL = /international|worldwide|world-wide|\bcanada\b|\bmexico\b|\beurope\b|\bexport|overseas|outside (of )?(the )?(u\.?s\.?|united states)|\bjapan\b|\bkorea\b|\bchina\b|\bunited kingdom\b|\buk\b|australia|caribbean|bahamas|dominican|\bpuerto rico\b|\bguam\b/i;
const STATE_NAME_RE = new RegExp(`\\b(${Object.keys(STATE_CODES).map((n) => n.replace(/\./g, "\\.")).sort((a, b) => b.length - a.length).join("|")})\\b`, "gi");
const CODE_SET = new Set(Object.values(STATE_CODES));
const NAME_BY_LOWER = new Map(Object.entries(STATE_CODES).map(([n, c]) => [n.toLowerCase(), c]));
/**
 * Two-letter codes: in mixed-case text an upper-case "WA" is a state. In all-caps text
 * ("SOLD IN RETAIL STORES") words like IN and OR would collide, so codes are only trusted
 * when they sit in a list ("CA, NV, AND OR").
 */
const CODE_ANY_RE = /\b([A-Z]{2})\b/g;
const CODE_LIST_RE = /\b([A-Z]{2})(?=\s*[,;&/]|\s+and\b|\s*\.?\s*$|\s*\))/g;
const USA_ONLY = /^\s*(usa?|u\.s\.a?\.?|united states)\s*\.?\s*$/i;

export interface Distribution {
  scope: GeoScope;
  states: string[];
  international: boolean;
}

/** Read states and scope from the agency's free-text distribution wording (FDA), or from an explicit state list (FSIS). */
export function parseDistribution(text: string | null, explicitStates: string[] | null): Distribution {
  const states = new Set<string>();
  let nationwide = false;
  let international = false;
  for (const s of explicitStates ?? []) {
    if (/nation/i.test(s)) nationwide = true;
    else if (CODE_SET.has(s.toUpperCase())) states.add(s.toUpperCase());
  }
  const t = text ?? "";
  if (t) {
    if (NATIONWIDE.test(t) || USA_ONLY.test(t)) nationwide = true;
    if (INTERNATIONAL.test(t)) international = true;
    for (const m of t.matchAll(STATE_NAME_RE)) {
      const code = NAME_BY_LOWER.get(m[1].toLowerCase());
      if (code) states.add(code);
    }
    const mixedCase = /[a-z]/.test(t);
    for (const m of t.matchAll(mixedCase ? CODE_ANY_RE : CODE_LIST_RE)) if (CODE_SET.has(m[1])) states.add(m[1]);
  }
  const list = [...states].sort();
  let scope: GeoScope = "unspecified";
  if (nationwide) scope = "nationwide";
  else if (list.length >= 2) scope = "multi-state";
  else if (list.length === 1) scope = "single-state";
  else if (international) scope = "international";
  return { scope, states: list, international };
}

// ---------- Root cause ----------

/** FSIS codes its reasons; some of those codes are root causes, others describe the hazard. */
const FSIS_CODED_ROOT_CAUSE: Record<string, RootCause> = {
  "misbranding": "labeling-or-packaging-error",
  "mislabeling": "labeling-or-packaging-error",
  "processing defect": "process-deviation",
  "insanitary conditions": "sanitation-or-facility",
  "import violation": "import-or-inspection-violation",
  "produced without benefit of inspection": "import-or-inspection-violation",
};

const ROOT_CAUSE_RULES: Array<[RootCause, RegExp]> = [
  ["import-or-inspection-violation", /import violation|without (the )?benefit of (federal )?inspection|ineligible (for|to) (import|export)|not eligible to (import|export)|not presented for (import )?(re)?inspection|no import inspection|from a country (that is )?not eligible|imported from .{0,40}(not|in)eligible/i],
  ["supplier-ingredient", /\bsupplier|\bvendor\b|ingredient (was|has been|is|had been) (recalled|contaminated|found)|recall(ed)? by (its|the|their) (supplier|ingredient)|notified by (its|their|the) (ingredient|supplier|manufacturer)|co-?packer|third[- ]party manufacturer|contract manufacturer|sourced from|ingredient supplier|an ingredient .{0,60}recall/i],
  ["equipment-failure", /equipment|machine|conveyor|\bblade\b|\bscreen\b|\bbelt\b|malfunction|broken (piece|part|wire|metal)|(piece|part) of (the )?(machine|equipment)/i],
  ["process-deviation", /underprocess|under-process|deviation|did not (receive|undergo|meet|reach)|insufficient(ly)? (cook|heat|pasteur|process)|temperature abuse|not (fully )?(cooked|pasteurized)|thermal process|improper(ly)? (stored|cooled|refrigerat|process|heat|cook)|inadequate (process|cook|heat|refrigerat)|processing (defect|error|deviation)|out of (temperature|refrigeration)|not kept (cold|refrigerated)|loss of refrigeration|held at (an )?improper/i],
  ["sanitation-or-facility", /insanitary|unsanitary|environmental (sample|swab|monitoring|positive|testing)|plant environment|facility (was|is|had)|sanitation|contaminated (surface|equipment area)|found in the (facility|plant|environment)/i],
  ["labeling-or-packaging-error", /wrong (label|package|packag|bag|carton|box|container|lid|film)|incorrect(ly)? (label|packag|bag|carton)|mislabel|label(ing|ed|s)? (error|does not|did not|fail|omit|may not)|not (listed|declared|included) on the (label|ingredient|package)|packag(ed|ing) (error|mix)|mis-?pack|ingredient statement|missing (from )?the (label|ingredient)|labels? (do|does) not|label change|omitted from the label|label mix/i],
];

export interface Classified<K> {
  category: K;
  basis: Basis;
  detail: string | null;
}

/** Root cause: FSIS coded reasons first (agency-coded), then keyword rules on the free text (inferred), else not stated. */
export function rootCauseFor(text: string, fsisReasonCodes: string[] | null): Classified<RootCause> {
  for (const code of fsisReasonCodes ?? []) {
    const rc = FSIS_CODED_ROOT_CAUSE[code.trim().toLowerCase()];
    if (rc) return { category: rc, basis: "agency-coded", detail: code.trim() };
  }
  for (const [cat, re] of ROOT_CAUSE_RULES) {
    const m = text.match(re);
    if (m) return { category: cat, basis: "inferred", detail: snippetAround(text, m.index ?? 0) };
  }
  return { category: "not-stated", basis: "not-stated", detail: null };
}

// ---------- Detection ----------

const DISCOVERY_SENTENCE = /(?:the )?(?:problem|issue|contamination) was (?:discovered|identified|found|detected|reported)[^.]*\./i;

const DETECTION_RULES: Array<[Detection, RegExp]> = [
  ["consumer-complaint", /consumer complaint|customer complaint|\bcomplaints?\b|consumer (reported|notified|found)/i],
  ["illness-report-or-outbreak", /illness(es)?|outbreak|\bsick\b|epidemiolog|reports? of (people|consumers?|individuals) (becoming|being|getting)|\bill\b/i],
  ["firm-self-reported", /(establishment|firm|company|producer|manufacturer) (notified|informed|contacted|alerted|reported to) (fsis|fda|the agency)|self-?report|(firm|company|establishment|manufacturer)'?s? (own )?(routine |internal |quality )?(testing|sampling|quality|internal|review|audit|monitoring)|internal (testing|audit|review|investigation)|during (the )?(firm|company|establishment)'s|(firm|company|establishment) (discovered|identified|found|determined)/i],
  ["other-agency-or-partner", /(fda|cdc|state|health department|department of (agriculture|health)|cfia|canadian|county|city|public health|laboratory|lab) (notified|informed|alerted|contacted)|notified (by|from) (the )?(fda|cdc|state|health department|department|a (state|county|city))|third[- ]party|retail(er)? (partner|customer) (notified|reported)|customer notified|distributor notified|(retailer|distributor|customer) (found|discovered|identified)/i],
  ["agency-sampling-or-inspection", /fsis (routine|surveillance|inspection|testing|sampling|in-plant|label review|verification|personnel|inspectors?)|routine (fsis|fda|state|agency|regulatory)|(state|fda|fsis|usda|department of agriculture|health department|agency) (sampling|testing|inspection|sample|inspectors?|laboratory)|sampl(e|ing) (collected|taken) by|during (a |an )?(routine )?(inspection|surveillance|sampling|testing|verification|label review|import reinspection)|inspection (personnel|program)|label review|tested positive|sample (tested|analysis|results)|laboratory (analysis|testing|results)|surveillance/i],
];

/** How the problem came to light. FSIS press releases usually say; FDA enforcement reports rarely do. Outbreaks are by definition illness reports. */
export function detectionFor(text: string, isOutbreak: boolean): Classified<Detection> {
  if (isOutbreak) return { category: "illness-report-or-outbreak", basis: "agency-coded", detail: "CDC outbreak investigation" };
  const sentence = text.match(DISCOVERY_SENTENCE)?.[0] ?? null;
  const scope = sentence ?? text;
  for (const [cat, re] of DETECTION_RULES) {
    if (re.test(scope)) return { category: cat, basis: "inferred", detail: sentence ?? snippetAround(text, text.search(re)) };
  }
  return { category: "not-stated", basis: "not-stated", detail: null };
}

// ---------- Corrective action and status ----------

export function correctiveActionFor(input: {
  source: "CDC" | "FDA" | "FSIS";
  agencyStatus: string;
  initiatedBy: string | null;
  notificationMethod: string | null;
  recallIssued: boolean | null;
}): { category: CorrectiveAction; detail: string | null } {
  if (input.source === "CDC") {
    if (input.recallIssued === true) return { category: "investigation-with-recall", detail: "CDC notice: recall issued" };
    if (input.recallIssued === false) return { category: "investigation-without-recall", detail: "CDC notice: no recall issued" };
    return { category: "investigation", detail: null };
  }
  if (input.source === "FSIS") {
    if (/public health alert/i.test(input.agencyStatus)) return { category: "public-health-alert", detail: "FSIS issued a public health alert instead of requesting a recall" };
    if (/unknown/i.test(input.agencyStatus)) return { category: "unknown", detail: null };
    return { category: "voluntary-recall", detail: "FSIS recall (all FSIS recalls are voluntary)" };
  }
  const mandated = /mandat/i.test(input.initiatedBy ?? "");
  const parts = [input.initiatedBy, input.notificationMethod ? `customers first notified by ${input.notificationMethod}` : null].filter(Boolean);
  if (!input.initiatedBy) return { category: "unknown", detail: parts.join("; ") || null };
  return { category: mandated ? "mandated-recall" : "voluntary-recall", detail: parts.join("; ") || null };
}

export function statusFor(input: { source: "CDC" | "FDA" | "FSIS"; agencyStatus: string; closedYear?: string | null }): { normalized: NormalizedStatus; agency: string } {
  const s = input.agencyStatus ?? "";
  if (input.source === "CDC") {
    const map: Record<string, NormalizedStatus> = { active: "open", over: "closed", unknown: "unknown" };
    const label: Record<string, string> = { active: "Investigation open", over: "Outbreak over", unknown: "Status not stated" };
    return { normalized: map[s] ?? "unknown", agency: label[s] ?? s };
  }
  if (input.source === "FSIS") {
    if (/active recall/i.test(s)) return { normalized: "open", agency: s };
    if (/closed/i.test(s)) return { normalized: "closed", agency: input.closedYear ? `${s} (${input.closedYear})` : s };
    if (/public health alert/i.test(s)) return { normalized: input.closedYear ? "closed" : "open", agency: input.closedYear ? `${s} (archived ${input.closedYear})` : `${s} (active)` };
    return { normalized: "unknown", agency: s || "Not stated" };
  }
  if (/ongoing/i.test(s)) return { normalized: "open", agency: s };
  if (/completed|terminated/i.test(s)) return { normalized: "closed", agency: s };
  return { normalized: "unknown", agency: s || "Not stated" };
}

// ---------- Helpers ----------

function snippetAround(text: string, index: number, span = 140): string | null {
  if (index < 0) return null;
  const start = Math.max(0, text.lastIndexOf(". ", index) + 2);
  const end = text.indexOf(". ", index);
  const s = text.slice(start, end === -1 ? text.length : end + 1).trim();
  return s.length <= span ? s : s.slice(0, span - 1).trimEnd() + "…";
}

export function slugify(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
