// The fixed vocabularies used to classify every signal, with the plain-language definitions
// the methodology page shows. Code and documentation come from this one file so they cannot
// drift apart. When a rule changes, bump RULES_VERSION and add a line to RULES_HISTORY: every
// record carries the version it was classified under, and the change log records what moved.

import type {
  CorrectiveAction, Detection, GeoScope, HazardType, NormalizedStatus, ProductCategory, RootCause, SignalKind, SignalSource,
} from "../types.js";

export const RULES_VERSION = "1.0";

export interface RulesRevision {
  version: string;
  date: string;
  summary: string;
}

/** Newest first. This is the methodology change log; the record change log is generated. */
export const RULES_HISTORY: RulesRevision[] = [
  {
    version: "1.0",
    date: "2026-09-17",
    summary:
      "First release of the classification rules: hazard type, organism or allergen, product category, geography, root cause, detection, corrective action, and status, with missing and inferred fields flagged on every record.",
  },
];

export interface Term<K extends string> {
  key: K;
  label: string;
  description: string;
}

export const HAZARD_TYPES: Term<HazardType>[] = [
  { key: "biological", label: "Biological", description: "A pathogen (bacteria, virus, or parasite) or a condition that lets one grow, such as underprocessing or temperature abuse." },
  { key: "allergen", label: "Undeclared allergen", description: "A major food allergen present but not declared on the label." },
  { key: "physical", label: "Physical", description: "Foreign material in the food: metal, plastic, glass, wood, bone, pests." },
  { key: "chemical", label: "Chemical", description: "Lead and other heavy metals, pesticide residue, unapproved additives or colors, cleaning chemicals, toxins." },
  { key: "labeling-regulatory", label: "Labeling or regulatory", description: "No named hazard: misbranding, import violations, or products made without required inspection." },
  { key: "other", label: "Other", description: "A stated problem that fits none of the above, such as spoilage or a packaging defect, with no agent named." },
  { key: "undetermined", label: "Undetermined", description: "The agency's wording matched none of our rules. The original reason is shown on the record." },
];

export const PRODUCT_CATEGORIES: Term<ProductCategory>[] = [
  { key: "produce", label: "Produce", description: "Fresh, cut, or frozen fruits, vegetables, herbs, and sprouts." },
  { key: "meat", label: "Meat", description: "Beef, pork, lamb, and products made mainly from them, including deli meats and sausages." },
  { key: "poultry", label: "Poultry", description: "Chicken, turkey, duck, and products made mainly from them." },
  { key: "seafood", label: "Seafood", description: "Fish and shellfish." },
  { key: "dairy", label: "Dairy", description: "Milk, cheese, yogurt, ice cream, butter, cream." },
  { key: "eggs", label: "Eggs", description: "Shell eggs and egg products." },
  { key: "nuts-and-seeds", label: "Nuts and seeds", description: "Nuts, seeds, and butters made from them." },
  { key: "grains-and-bakery", label: "Grains and bakery", description: "Flour, cereal, bread, pasta, baked goods, cookies." },
  { key: "snacks-and-confectionery", label: "Snacks and confectionery", description: "Chips, crackers, candy, chocolate." },
  { key: "prepared-foods", label: "Prepared foods", description: "Ready-to-eat meals, sandwiches, salads, soups, dips, frozen entrees." },
  { key: "condiments-and-spices", label: "Condiments and spices", description: "Spices, seasonings, sauces, dressings, oils, sweeteners." },
  { key: "beverages", label: "Beverages", description: "Juice, water, soft drinks, coffee, tea, and other drinks." },
  { key: "infant-and-baby", label: "Infant and baby", description: "Infant formula and foods marketed for babies and toddlers." },
  { key: "pet-food", label: "Pet food", description: "Food and treats for animals. FDA files these under food; they are labeled here so they are never mistaken for human food." },
  { key: "other", label: "Other or unclassified", description: "Nothing in the product description matched a category." },
];

export const GEO_SCOPES: Term<GeoScope>[] = [
  { key: "nationwide", label: "Nationwide", description: "The agency says the product was distributed nationwide or throughout the US." },
  { key: "multi-state", label: "Multi-state", description: "Two or more named states." },
  { key: "single-state", label: "Single state", description: "One named state." },
  { key: "international", label: "International only", description: "Only distribution outside the US was named." },
  { key: "unspecified", label: "Unspecified", description: "The agency gave no distribution area, or gave one our rules could not read. The original wording is on the record." },
];

export const ROOT_CAUSES: Term<RootCause>[] = [
  { key: "labeling-or-packaging-error", label: "Labeling or packaging error", description: "Wrong label, wrong package, or an ingredient left off the label." },
  { key: "supplier-ingredient", label: "Supplier or ingredient", description: "An ingredient or component from a supplier was contaminated or recalled." },
  { key: "process-deviation", label: "Process deviation", description: "Underprocessing, temperature abuse, or another step that did not go as designed." },
  { key: "equipment-failure", label: "Equipment failure", description: "Broken or worn equipment, usually the origin of metal or plastic fragments." },
  { key: "sanitation-or-facility", label: "Sanitation or facility", description: "Insanitary conditions or a contaminated plant environment." },
  { key: "import-or-inspection-violation", label: "Import or inspection violation", description: "Product entered the US without eligibility or inspection, or was made without federal inspection." },
  { key: "not-stated", label: "Not stated", description: "The agency did not say why the problem happened. This is the honest default: most notices describe the hazard, not its cause." },
];

export const DETECTIONS: Term<Detection>[] = [
  { key: "consumer-complaint", label: "Consumer complaint", description: "A consumer or customer reported the problem." },
  { key: "illness-report-or-outbreak", label: "Illness reports or outbreak", description: "Reported illnesses or an outbreak investigation led to the action." },
  { key: "firm-self-reported", label: "Firm's own testing or review", description: "The company found the problem itself and told the agency." },
  { key: "other-agency-or-partner", label: "Another agency or partner", description: "Another agency, a state lab, or a business partner notified the responsible agency." },
  { key: "agency-sampling-or-inspection", label: "Agency sampling or inspection", description: "Routine agency testing, inspection, or surveillance found it." },
  { key: "not-stated", label: "Not stated", description: "The notice does not say how the problem was found. FDA enforcement reports never do." },
];

export const CORRECTIVE_ACTIONS: Term<CorrectiveAction>[] = [
  { key: "voluntary-recall", label: "Voluntary recall", description: "The firm removed the product from the market. Nearly all US food recalls are voluntary." },
  { key: "mandated-recall", label: "Mandated recall", description: "FDA ordered the recall." },
  { key: "public-health-alert", label: "Public health alert", description: "FSIS warned the public without a recall, usually because the product is no longer for sale." },
  { key: "investigation-with-recall", label: "Outbreak investigation, recall issued", description: "CDC's notice says a recall was issued for the implicated food." },
  { key: "investigation-without-recall", label: "Outbreak investigation, no recall", description: "CDC's notice says no recall was issued." },
  { key: "investigation", label: "Outbreak investigation", description: "CDC's notice does not say whether a recall was issued." },
  { key: "unknown", label: "Unknown", description: "The source gave no usable information." },
];

export const STATUSES: Term<NormalizedStatus>[] = [
  { key: "open", label: "Open", description: "FDA \"Ongoing\", FSIS \"Active Recall\" or an active public health alert, or a CDC investigation CDC lists as open." },
  { key: "closed", label: "Closed", description: "FDA \"Completed\" or \"Terminated\", FSIS \"Closed Recall\" or an archived alert, or an outbreak CDC has declared over." },
  { key: "unknown", label: "Unknown", description: "The source gave no status we could read." },
];

export const KINDS: Term<SignalKind>[] = [
  { key: "recall", label: "Recall", description: "A product recall from FDA or USDA FSIS." },
  { key: "public-health-alert", label: "Public health alert", description: "An FSIS alert issued instead of a recall." },
  { key: "outbreak", label: "Outbreak notice", description: "A CDC multistate foodborne outbreak investigation notice." },
];

export const SOURCES: Term<SignalSource>[] = [
  { key: "CDC", label: "CDC", description: "Centers for Disease Control and Prevention: multistate outbreak notices." },
  { key: "FDA", label: "FDA", description: "Food and Drug Administration: enforcement reports via openFDA, covering most foods and pet food." },
  { key: "FSIS", label: "USDA FSIS", description: "USDA Food Safety and Inspection Service: meat, poultry, and egg product recalls and alerts." },
];

export const BASIS_LABEL: Record<string, string> = {
  "agency-coded": "Coded by the agency",
  inferred: "Inferred from the agency's wording by our rules",
  "not-stated": "Not stated by the agency",
};

export const labelOf = <K extends string>(terms: Term<K>[], key: K | string): string => terms.find((t) => t.key === key)?.label ?? String(key);
