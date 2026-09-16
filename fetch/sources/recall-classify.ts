import type { RecallCategory, ReasonCategory } from "../types.js";

export function reasonCategory(text: string): ReasonCategory {
  const t = text.toLowerCase();
  if (/listeria/.test(t)) return "listeria";
  if (/salmonella/.test(t)) return "salmonella";
  if (/e\.? ?coli|stec|shiga/.test(t)) return "ecoli";
  if (/hepatitis|norovirus|cyclospora|clostridium|botul|cronobacter|staph|bacillus|shigella|campylobacter|vibrio|mold|yeast|microbial|pathogen|contaminat|pasteuriz|spoil|temperature abuse/.test(t)) return "other-pathogen";
  if (/undeclared|not declared|allergen|allergy|contains statement|ingredient statement|(milk|egg|fish|shellfish|crustacean|tree nut|peanut|wheat|soy|sesame|almond|walnut|cashew|pecan|hazelnut).{0,60}(declar|label|list)/.test(t)) return "undeclared-allergen";
  if (/foreign (material|object|matter)|metal|plastic|glass|wood|extraneous/.test(t)) return "foreign-material";
  if (/import violation|without (the )?benefit of inspection|misbrand|mislabel|inaccurately declared|ineligible/.test(t)) return "regulatory";
  return "other";
}

export function recallCategory(text: string): RecallCategory {
  const t = text.toLowerCase();
  if (/dietary supplement|\bsupplement\b|capsules?\b|softgels?\b|gummies (vitamin|supplement)/.test(t)) return "dietary-supplement";
  if (/pet food|dog food|cat food|dog treat|cat treat|pet treat|for dogs|for cats|canine|feline|animal food|animal feed|\bfeed\b|puppy|kitten/.test(t)) return "pet-food";
  return "human-food";
}

export function classification(text: string | null | undefined): "Class I" | "Class II" | "Class III" | null {
  const m = (text ?? "").match(/class\s*(I{1,3})\b/i);
  return m ? (`Class ${m[1].toUpperCase()}` as "Class I" | "Class II" | "Class III") : null;
}
