// @ts-check
import { defineConfig } from "astro/config";

// The site is a fully static build served at the root of the custom domain
// (site/public/CNAME tells GitHub Pages which domain). If it ever moves back to
// https://spaceplace.github.io/food-safety-dashboard/, set SITE_BASE="/food-safety-dashboard".
const base = process.env.SITE_BASE ?? "/";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://foodsafetybrief.org",
  base,
  srcDir: "./site/src",
  publicDir: "./site/public",
  outDir: "./site/dist",
  trailingSlash: "always",
  build: { format: "directory" },
});
