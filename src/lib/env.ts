let cachedEnv: CloudflareEnv | null = null;
let proxyPromise: Promise<CloudflareEnv> | null = null;

export async function getEnv(requestEnv?: unknown): Promise<CloudflareEnv> {
  if (requestEnv && (requestEnv as CloudflareEnv).DB) {
    cachedEnv = requestEnv as CloudflareEnv;
    return cachedEnv;
  }

  if (cachedEnv) {
    return cachedEnv;
  }

  // Cloudflare Workers runtime
  const g = globalThis as unknown as { __env?: CloudflareEnv };
  if (g.__env?.DB) {
    cachedEnv = g.__env;
    return cachedEnv;
  }

  // Node.js / Vite Dev Server runtime: Use wrangler getPlatformProxy
  if (!proxyPromise) {
    proxyPromise = (async () => {
      try {
        const { getPlatformProxy } = await import("wrangler");
        const proxy = await getPlatformProxy<CloudflareEnv>({ configPath: "./wrangler.jsonc" });
        const env = { ...proxy.env } as CloudflareEnv;

        if (!env.BETTER_AUTH_URL) {
          env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://localhost:8080";
        }
        if (!env.BETTER_AUTH_SECRET) {
          env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "";
        }
        if (!env.GOOGLE_CLIENT_ID) {
          env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
        }
        if (!env.GOOGLE_CLIENT_SECRET) {
          env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
        }

        cachedEnv = env;
        return cachedEnv;
      } catch (err) {
        console.error("Failed to load Cloudflare platform proxy:", err);
        return process.env as unknown as CloudflareEnv;
      }
    })();
  }

  return proxyPromise;
}

export function setCachedEnv(env: CloudflareEnv) {
  cachedEnv = env;
}
