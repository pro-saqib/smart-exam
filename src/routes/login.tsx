import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSession } from "@/lib/session";
import { signIn } from "@/lib/auth-client";
import { useState } from "react";
import { toast } from "sonner";

const checkAuth = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSession();
  if (session?.user) throw redirect({ to: "/" });
  return null;
});

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in — PrepMind" }],
  }),
  beforeLoad: () => checkAuth(),
  component: LoginPage,
});

function LoginPage() {
  const [loading, setLoading] = useState<"google" | null>(null);

  const handleSignIn = async () => {
    setLoading("google");
    try {
      const res = await signIn.social({ provider: "google", callbackURL: "/" });
      if (res?.error) {
        toast.error(res.error.message || "Sign in failed. Please try again.");
        setLoading(null);
      }
    } catch (err: any) {
      toast.error(err?.message || "Sign in failed. Please try again.");
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex size-14 rounded-2xl gradient-primary items-center justify-center shadow-glow mx-auto">
            <span className="text-2xl font-bold text-primary-foreground">P</span>
          </div>
          <h1 className="text-2xl font-semibold">PrepMind</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to sync your subjects and progress across devices.
          </p>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleSignIn}
            disabled={loading !== null}
            className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading === "google" ? (
              <span className="size-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Your data is stored securely and synced across all your devices.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
