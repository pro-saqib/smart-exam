import { createAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getRequest } from "@tanstack/react-start/server";

export async function getSession() {
  const request = getRequest();
  if (!request) return null;

  const env = await getEnv();
  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  return session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

