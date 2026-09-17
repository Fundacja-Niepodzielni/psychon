"use client";

import { useState, type FormEvent } from "react";
import VerificationCard, {
  type VerifyResult,
} from "@/components/certyfikat/VerificationCard";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/molecules/ErrorState";
import Input from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api";

export default function VerificationSearchPage() {
  const [number, setNumber] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [awaria, setAwaria] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ostatnieZapytanie, setOstatnieZapytanie] = useState("");

  async function wyszukaj(query: string) {
    setLoading(true);
    setResult(null);
    setNotFound(false);
    setAwaria(false);
    setOstatnieZapytanie(query);

    try {
      setResult(await api<VerifyResult>(`/verify/${query}`));
    } catch (err) {
      // 404 (numer nieznany/w złym formacie) — komunikat „nie znaleziono";
      // każda inna odpowiedź (5xx, sieć) — osobny komunikat awarii z ponowieniem.
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setAwaria(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const query = number.trim();
    if (!query) return;
    await wyszukaj(query);
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
          {awaria && (
            <ErrorState
              message="Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."
              onRetry={() => void wyszukaj(ostatnieZapytanie)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
