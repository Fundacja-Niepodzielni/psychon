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
import PublicPageTemplate from "@/components/templates/PublicPageTemplate";
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
    setNotFound(false);
    setAwaria(false);
    setOstatnieZapytanie(query);

    try {
      const wynik = await api<VerifyResult>(`/verify/${query}`);
      setResult(wynik);
    } catch (err) {
      // 404 (numer nieznany/w złym formacie) — to rozstrzygnięcie samo w
      // sobie, stary wynik przestaje być aktualną odpowiedzią na pytanie
      // użytkownika. Każda inna odpowiedź (5xx, sieć) to awaria połączenia,
      // nie odpowiedź na pytanie — poprzednio wczytany wynik zostaje na
      // ekranie, komunikat awarii idzie obok niego, nie zamiast niego.
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
        setResult(null);
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
    <PublicPageTemplate
      naglowek={{
        title: "Weryfikacja certyfikatu",
        description: "Wpisz numer certyfikatu, np. NP/2026/001",
      }}
    >
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
    </PublicPageTemplate>
  );
}
