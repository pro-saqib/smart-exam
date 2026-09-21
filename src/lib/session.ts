import { createAuth, ADMIN_EMAILS } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { createDb } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRequest } from "@tanstack/react-start/server";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: "admin" | "user";
};

// Dev-only fake admin session for localhost testing — bypasses Google OAuth
const DEV_ADMIN_SESSION = {
  user: {
    id: "dev-admin",
    name: "Dev Admin",
    email: ADMIN_EMAILS[0],
    image: null,
    role: "admin" as const,
  },
  session: { id: "dev-session", userId: "dev-admin" },
} as const;

export async function getSession() {
  const request = getRequest();
  if (!request) return null;

  const env = await getEnv();

  // Bypass auth on localhost in development for admin access
  if (process.env.NODE_ENV === "development") {
    const host = request.headers.get("host") || "";
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
      try {
        const db = createDb(env.DB);
        const existing = await db
          .select({ id: user.id, name: user.name, email: user.email, role: user.role })
          .from(user)
          .where(eq(user.email, ADMIN_EMAILS[0]))
          .get();

        if (existing) {
          return {
            user: {
              id: existing.id,
              name: existing.name || "Dev Admin",
              email: existing.email,
              image: null,
              role: "admin" as const,
            },
            session: { id: "dev-session", userId: existing.id },
          };
        } else {
          await db
            .insert(user)
            .values({
              id: "dev-admin",
              name: "Dev Admin",
              email: ADMIN_EMAILS[0],
              role: "admin",
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoNothing();

          return DEV_ADMIN_SESSION as { user: SessionUser; session: any };
        }
      } catch (err) {
        console.error("Dev session lookup error:", err);
        return DEV_ADMIN_SESSION as { user: SessionUser; session: any };
      }
    }
  }

  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });

  if (session?.user) {
    const isDesignatedAdmin = ADMIN_EMAILS.some(
      (email) => email.toLowerCase() === session.user.email?.toLowerCase(),
    );
    const role = (isDesignatedAdmin ? "admin" : (session.user as any).role || "user") as "admin" | "user";
    (session.user as any).role = role;
  }

  return session as { user: SessionUser; session: any } | null;
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    throw new Error("FORBIDDEN: Admin privileges required");
  }
  return session;
}

