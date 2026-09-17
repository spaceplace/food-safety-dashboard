// The compact dataset the explorer page loads in the browser. Built once at deploy time.
import type { APIRoute } from "astro";
import { compactSignals, signalsFile } from "../../lib/signals";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      generatedAt: signalsFile.generatedAt,
      rulesVersion: signalsFile.rulesVersion,
      windowStart: signalsFile.windowStart,
      items: compactSignals,
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
