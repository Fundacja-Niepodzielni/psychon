"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/molecules/ErrorState";
import LoadingState from "@/components/molecules/LoadingState";
import PublicPageTemplate from "@/components/templates/PublicPageTemplate";
import Stack from "@/components/ui/Stack";
import Text from "@/components/ui/Text";
import { ApiError } from "@/lib/api";
import {
  fetchLegalDocument,
  jestZnanymTypemDokumentu,
  LEGAL_DOCUMENT_LABELS,
  type LegalDocument,
} from "@/lib/h22/legal-documents";

type Screen =
  | { kind: "loading" }
  | { kind: "ready"; document: LegalDocument }
  | { kind: "not_published" }
  | { kind: "unknown_type" }
  | { kind: "error"; message: string };

function formatujDate(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Ekran dokumentu prawnego (H22, pozycja 28 Załącznika 1) — wydzielony z
 * `DokumentPrawnyPage` niżej, żeby dało się go renderować w teście wprost
 * z gotowym `typ: string`, bez owijania w `Suspense`. Powód: `use(params)`
 * (wymagany przez konwencję Next 16 poniżej) suspenduje pierwszy render
 * NAWET dla już rozstrzygniętej obietnicy — zmierzone w tym środowisku
 * (jsdom + Vitest + React 19.2.8 + `@vitejs/plugin-react`), że taki
 * Suspense nigdy się nie wybudza (ani przez `waitFor`, ani przez ręczny
 * `await act(async () => { await p; })`) — osobny, potwierdzony problem
 * środowiska testowego, nie tego komponentu. Rzeczywisty Next.js (poza tym
 * testem) obsługuje ten wzorzec poprawnie — patrz działający już
 * `app/(uczestnik)/panel/kursy/[slug]/page.tsx`.
 *
 * Nieznany rodzaj w adresie (spoza `LEGAL_DOCUMENT_TYPES`) dostaje własny
 * stan „nie znaleziono" bez wołania API — ten sam wzorzec co stan
 * `not_found` na stronie kursu (własny nagłówek `h1` w karcie, nie
 * `notFound()` z `next/navigation`, żeby kolejność hooków została
 * bezwarunkowa).
 */
export function DokumentPrawnyEkran({ typ }: { typ: string }) {
  const znany = jestZnanymTypemDokumentu(typ);

  const [ponowienie, setPonowienie] = useState(0);
  // Wynik jest związany z parametrami żądania (ten sam wzorzec co
  // `panel/kursy/[slug]/page.tsx`): po zmianie typu albo po ponowieniu stary
  // ekran nigdy nie zostaje na widoku, a efekt nie wywołuje `setState`
  // synchronicznie w swoim ciele (react-hooks/set-state-in-effect).
  const key = `${typ}#${ponowienie}`;
  const [loaded, setLoaded] = useState<{ key: string; screen: Screen } | null>(
    null,
  );

  useEffect(() => {
    if (!znany) return;

    let aktywny = true;

    fetchLegalDocument(typ)
      .then((document) => {
        if (aktywny) setLoaded({ key, screen: { kind: "ready", document } });
      })
      .catch((err) => {
        if (!aktywny) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoaded({ key, screen: { kind: "not_published" } });
        } else {
          setLoaded({
            key,
            screen: {
              kind: "error",
              message: "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.",
            },
          });
        }
      });

    return () => {
      aktywny = false;
    };
  }, [typ, znany, key]);

  const stan: Screen = !znany
    ? { kind: "unknown_type" }
    : loaded !== null && loaded.key === key
      ? loaded.screen
      : { kind: "loading" };

  if (stan.kind === "unknown_type") {
    return (
      <main id="tresc" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-stack px-4 py-10 sm:px-6">
        <Card className="flex max-w-2xl flex-col gap-4">
          <h1 className="text-h3 font-black text-ink">Nie znaleziono dokumentu</h1>
          <Text tone="muted">Ten rodzaj dokumentu prawnego nie istnieje.</Text>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center self-start rounded-pill bg-primary px-6 py-2.5 text-body font-medium text-light transition-colors duration-200 hover:bg-ink focus-visible:focus-ring"
          >
            Wróć na stronę główną
          </Link>
        </Card>
      </main>
    );
  }

  const tytul = LEGAL_DOCUMENT_LABELS[typ as keyof typeof LEGAL_DOCUMENT_LABELS];

  return (
    <PublicPageTemplate naglowek={{ title: tytul }}>
      {stan.kind === "loading" && <LoadingState label="Wczytywanie dokumentu…" />}

      {stan.kind === "ready" && (
        <Card>
          <Stack>
            <Text size="small" tone="muted">
              Wersja {stan.document.version} · {formatujDate(stan.document.published_at)}
            </Text>
            <Stack>
              {stan.document.content
                .split(/\n{2,}/)
                .map((akapit) => akapit.trim())
                .filter((akapit) => akapit.length > 0)
                .map((akapit, indeks) => (
                  <Text key={indeks}>{akapit}</Text>
                ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {stan.kind === "not_published" && (
        <Alert variant="info">Dokument nie został jeszcze opublikowany.</Alert>
      )}

      {stan.kind === "error" && (
        <ErrorState
          message={stan.message}
          onRetry={() => setPonowienie((n) => n + 1)}
        />
      )}
    </PublicPageTemplate>
  );
}

/**
 * Strona (konwencja Next 16): `params` przychodzi jako `Promise`,
 * rozpakowujemy je Reactowym `use()` — ten sam wzorzec co
 * `app/(uczestnik)/panel/kursy/[slug]/page.tsx`. Cała logika ekranu jest w
 * `DokumentPrawnyEkran` wyżej (testowana wprost, patrz komentarz tam).
 */
export default function DokumentPrawnyPage({
  params,
}: {
  params: Promise<{ typ: string }>;
}) {
  const { typ } = use(params);
  return <DokumentPrawnyEkran typ={typ} />;
}
