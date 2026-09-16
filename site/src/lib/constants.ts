export const SITE_NAME = "Food Safety Dashboard";
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
