"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function GlobalErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <Card className="w-full max-w-xl text-center">
        <p className="text-caption font-bold uppercase tracking-wide text-subtle">
          Błąd aplikacji
        </p>
        <h1 className="mt-1 text-h3 font-bold text-ink">Coś poszło nie tak</h1>
        <p className="mt-3 text-body text-muted">
          Wystąpił nieoczekiwany błąd. Spróbuj ponownie — jeśli problem wraca,
          daj znać zespołowi.
        </p>
        <div className="mt-6">
          <Button onClick={() => retry()}>Spróbuj ponownie</Button>
        </div>
      </Card>
    </div>
  );
}
