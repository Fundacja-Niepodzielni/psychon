"use client";

import { useState, type FormEvent } from "react";
import VerificationCard, {
  type VerifyResult,
} from "@/components/certyfikat/VerificationCard";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { api } from "@/lib/api";

export default function VerificationSearchPage() {
  const [number, setNumber] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const query = number.trim();
    if (!query) return;

    setLoading(true);
    setResult(null);
    setNotFound(false);

    try {
      setResult(await api<VerifyResult>(`/verify/${query}`));
    } catch {
      setNotFound(true); // 404 lub inny błąd — komunikat jednolity (kontrakt)
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-h2 font-black text-ink">Weryfikacja certyfikatu</h1>
          <p className="mt-1 text-small text-subtle">
            Wpisz numer certyfikatu, np. NP/2026/001
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <Input
              label="Numer certyfikatu"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="NP/2026/001"
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              Sprawdź
            </Button>
          </form>
        </Card>

        <div className="mt-4">
          {result && <VerificationCard result={result} />}
          {notFound && (
            <Alert variant="error">
              Nie znaleziono certyfikatu o podanym numerze.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
