// Turns free-text food descriptions into a small set of normalized food keys so the site
// can group "Romaine lettuce", "iceberg lettuce" and "bagged salad" under "lettuce".
// Order matters only for readability; every matching key is returned.

const FOOD_RULES: Array<[key: string, pattern: RegExp]> = [
  ["lettuce", /\b(lettuce|romaine|iceberg|leafy greens?|salad(s| kits?| mix)?)\b/i],
  ["spinach", /\bspinach\b/i],
  ["sprouts", /\bsprouts?\b/i],
  ["tomatoes", /\btomato(es)?\b/i],
  ["peppers", /\b(jalape[nñ]os?|peppers?|serrano)\b/i],
  ["onions", /\bonions?\b/i],
  ["cucumbers", /\bcucumbers?\b/i],
  ["melon", /\b(cantaloupes?|melons?|watermelons?|honeydew)\b/i],
  ["berries", /\b(blueberr|strawberr|raspberr|blackberr|berries|berry)/i],
  ["stone fruit", /\b(peach|nectarine|plum|apricot|cherr)/i],
  ["apples", /\bapples?\b/i],
  ["avocado", /\b(avocados?|guacamole)\b/i],
  ["mushrooms", /\b(mushrooms?|enoki)\b/i],
  ["herbs", /\b(basil|cilantro|parsley|herbs?)\b/i],
  ["eggs", /\b(eggs?|egg products?)\b/i],
  ["chicken", /\bchicken\b/i],
  ["turkey", /\bturkey\b/i],
  ["poultry", /\bpoultry\b/i],
  ["beef", /\b(beef|ground beef|hamburger|steak)\b/i],
  ["pork", /\b(pork|ham|bacon|sausage|chicharr|guanciale|prosciutto|salami)/i],
  ["deli meat", /\b(deli|charcuterie|lunch ?meat|cold cuts|hot dogs?|frankfurters?)\b/i],
  ["seafood", /\b(oysters?|shellfish|clams?|mussels?|scallops?|shrimp|crab|lobster|seafood)\b/i],
  ["fish", /\b(fish|salmon|tuna|tilapia|cod|sushi)\b/i],
  ["dairy", /\b(milk|cheese|queso|yogurt|ice cream|dairy|cream|butter|kefir)\b/i],
  ["raw milk", /\braw (milk|dairy)\b/i],
  ["infant formula", /\b(infant formula|baby formula|formula)\b/i],
  ["flour", /\b(flour|dough|cake mix|baking mix)\b/i],
  ["nuts", /\b(peanuts?|almonds?|cashews?|pistachios?|walnuts?|pecans?|hazelnuts?|macadamia|nut butter|tahini|nuts?)\b/i],
  ["seeds", /\b(sesame|sunflower|chia|flax|seeds?)\b/i],
  ["frozen vegetables", /\b(frozen (vegetables?|corn|peas|broccoli))\b/i],
  ["cereal", /\b(cereal|granola|oats?)\b/i],
  ["chocolate", /\b(chocolate|candy|cocoa)\b/i],
  ["baked goods", /\b(cookies?|bread|muffins?|cakes?|pastr|donuts?|bakery)/i],
  ["ready-to-eat meals", /\b(ready[- ]to[- ]eat|prepared meals?|sandwich|wraps?|burritos?)\b/i],
  ["pet food", /\b(pet food|dog food|cat food|dog treats?|cat treats?|pet treats?|for dogs|for cats)\b/i],
  ["supplements", /\b(dietary supplement|supplement|capsules?|tablets?)\b/i],
  ["beverages", /\b(juice|smoothie|cider|kombucha|beverage|drink|water)\b/i],
];

export function foodKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const [key, re] of FOOD_RULES) if (re.test(text)) out.push(key);
  return out;
}
