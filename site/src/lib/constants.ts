export const SITE_NAME = "Food Safety Brief";
export const REPO_URL = "https://github.com/spaceplace/food-safety-dashboard";

/** CDC's official estimate of annual foodborne illness burden from the seven major pathogens (2019 estimates, published 2025). */
export const CDC_BURDEN = {
  illnesses: 9_900_000,
  hospitalizations: 53_300,
  deaths: 931,
  label: "CDC estimate of annual burden from seven major pathogens (2019 data, published 2025)",
  url: "https://www.cdc.gov/foodborneburden/index.html",
};

export const SOURCE_LINKS = {
  cdcOutbreaks: "https://www.cdc.gov/foodborne-outbreaks/outbreaks/",
  cdcNors: "https://www.cdc.gov/nors/index.html",
  openFda: "https://open.fda.gov/apis/food/enforcement/",
  fdaRecalls: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts",
  fsisRecalls: "https://www.fsis.usda.gov/recalls",
  fsisApi: "https://www.fsis.usda.gov/science-data/developer-resources/recall-api",
};

/**
 * GoatCounter site code — the first part of your goatcounter.com subdomain, so
 * "foodsafetybrief" for https://foodsafetybrief.goatcounter.com.
 *
 * Set this to "" to switch visitor counting off completely: the script tag is
 * then never rendered and the site makes no third-party requests at all. The
 * script itself already ignores localhost and private addresses, so local
 * development and preview builds are never counted.
 */
export const GOATCOUNTER_CODE = "foodsafetybrief";
