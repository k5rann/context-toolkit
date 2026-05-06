"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/";
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Wrong password");
        setSubmitting(false);
        return;
      }
      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-border/60">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border/60 mx-auto">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Context Toolkit
          </h1>
          <p className="text-sm text-muted-foreground">
            This instance is private. Enter the password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className="h-11"
          />
          {error && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}
          <Button
            type="submit"
            disabled={submitting || !password}
            className="w-full h-11"
          >
            {submitting ? "Checking..." : "Enter"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AuthPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <React.Suspense fallback={null}>
        <AuthForm />
      </React.Suspense>
    </div>
  );
}
