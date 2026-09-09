import { createAuth, ADMIN_EMAILS } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getRequest } from "@tanstack/react-start/server";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: "admin" | "user";
};

export async function getSession() {
  const request = getRequest();
  if (!request) return null;

  const env = await getEnv();
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

