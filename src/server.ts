import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { createAuth } from "./lib/auth";
import { getEnv, setCachedEnv } from "./lib/env";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function renderGeoBlockedPage(country: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Restricted — PrepMind</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: #090d16;
      color: #f1f5f9;
      text-align: center;
    }
    .card {
      max-width: 480px;
      padding: 2.5rem;
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 1rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #ef4444;
      font-size: 0.875rem;
      font-weight: 600;
      border-radius: 9999px;
      margin-bottom: 1.25rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
    }
    p {
      color: #94a3b8;
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }
    .footer {
      font-size: 0.8rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Region Restricted</div>
    <h1>Available Exclusively in Pakistan</h1>
    <p>PrepMind is tailored for Pakistani competitive exams (PPSC, FPSC, CSS, NTS, FGEI) and is currently accessible only within Pakistan.</p>
    <div class="footer">Detected Country: ${country || "Unknown"} • PrepMind Security Gateway</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 403,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
    },
  });
}

function applySecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("x-frame-options", "DENY");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-xss-protection", "1; mode=block");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // ─── Geo-Restriction (Pakistan Only) ───────────────────────────
      const cf = (request as unknown as { cf?: { country?: string } }).cf;
      const country = (request.headers.get("cf-ipcountry") || cf?.country || "").toUpperCase();

      // Allow local development (empty/XX/T1) and Pakistani traffic (PK)
      const isLocalOrDev = !country || country === "XX" || country === "T1";
      if (!isLocalOrDev && country !== "PK") {
        return renderGeoBlockedPage(country);
      }

      const resolvedEnv = await getEnv(env);
      if (env) {
        setCachedEnv(resolvedEnv);
      }

      // Intercept all better-auth routes before TanStack Start handles them
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/auth")) {
        try {
          if (!resolvedEnv?.DB) {
            throw new Error("Missing D1 database binding in resolvedEnv");
          }
          const auth = createAuth(resolvedEnv);
          const authRes = await auth.handler(request);
          return applySecurityHeaders(authRes);
        } catch (authErr) {
          console.error("Auth handler error:", authErr);
          return applySecurityHeaders(
            new Response(
              JSON.stringify({
                error: "Auth error",
                message: authErr instanceof Error ? authErr.message : String(authErr),
                stack: authErr instanceof Error ? authErr.stack : undefined,
              }),
              { status: 500, headers: { "content-type": "application/json" } }
            )
          );
        }
      }

      const handler = await getServerEntry();
      const rawResponse = await handler.fetch(request, resolvedEnv, ctx);
      const response = await normalizeCatastrophicSsrResponse(rawResponse);
      return applySecurityHeaders(response);
    } catch (error) {
      console.error("Server fetch error:", error);
      return applySecurityHeaders(
        new Response(
          `Server Error: ${error instanceof Error ? error.stack || error.message : String(error)}`,
          { status: 500, headers: { "content-type": "text/plain" } }
        )
      );
    }
  },
};

