// One HTTP client for every fetcher. CDC and USDA sit behind bot protection (Akamai) that
// rejects requests which do not look like a real browser. From a home connection a plain
// User-Agent is enough; from GitHub's servers only the full Chrome header set below passes
// (verified with fetch/experiments/probe.mjs on 2026-09-17). Every request goes through here.

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
};

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  accept?: string;
}

export class HttpError extends Error {
  constructor(public url: string, public status: number, message?: string) {
    super(message ?? `HTTP ${status} for ${url}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const { timeoutMs = 30_000, retries = 2, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { ...BROWSER_HEADERS, Accept: accept },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        // 4xx other than 429 will not get better with retries.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new HttpError(url, res.status);
        throw new HttpError(url, res.status);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      const retriable = !(err instanceof HttpError) || err.status === 429 || err.status >= 500;
      if (!retriable || attempt === retries) break;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, { accept: "application/json,*/*;q=0.8", ...opts });
  return JSON.parse(text) as T;
}

/** Run async tasks with at most `limit` in flight. Keeps us polite to CDC. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
