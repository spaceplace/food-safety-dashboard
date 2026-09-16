// @ts-check
import { defineConfig } from "astro/config";

// The site is a fully static build. On GitHub Pages it lives at
// https://spaceplace.github.io/food-safety-dashboard/ so `base` must match the repo name.
// Set SITE_BASE="/" when serving from a custom domain later.
const base = process.env.SITE_BASE ?? "/food-safety-dashboard";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://spaceplace.github.io",
  base,
  srcDir: "./site/src",
  publicDir: "./site/public",
  outDir: "./site/dist",
  trailingSlash: "always",
  build: { format: "directory" },
});
