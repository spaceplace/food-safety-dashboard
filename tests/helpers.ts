import { readFileSync } from "node:fs";
import path from "node:path";
export const fixture = (rel: string) => readFileSync(path.join(process.cwd(), "fixtures", rel), "utf8");
