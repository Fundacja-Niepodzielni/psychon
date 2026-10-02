"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api/klient";
import { czyTrybPodgladu, PARAMETR_PODGLADU } from "./tryb-podgladu";

export interface StanTrybuPodgladu {
  /** Parametr `podglad=1` w adresie ORAZ rola personelu albo prowadzącego. */
  podglad: boolean;
  /** Rola konta; `null`, dopóki odczyt konta trwa albo się nie udał. */
  rola: string | null;
}

/**
 * Tryb podglądu dla ekranu stojącego w ramce: czyta parametr adresu i rolę
 * konta z `GET /me`, który ramka odpytuje już na stronie (odpowiedź jest
 * wspólna, więc to nie jest nowe żądanie sieciowe). Konta nie czyta wcale,
 * gdy w adresie nie ma parametru. Dopóki rola nie jest znana albo odczyt się
 * nie udał, `podglad` jest `false` — ekran jest zwykły, bez pasa.
 */
export function useTrybPodgladu(): StanTrybuPodgladu {
  const parametr = useSearchParams()?.get(PARAMETR_PODGLADU) ?? null;
  const [rola, setRola] = useState<string | null>(null);

  useEffect(() => {
    if (parametr === null) return;
    let aktywny = true;
    api<{ role?: unknown }>("/me")
      .then((konto) => {
        if (aktywny) setRola(typeof konto.role === "string" ? konto.role : null);
      })
      .catch(() => {
        if (aktywny) setRola(null);
      });
    return () => {
      aktywny = false;
    };
  }, [parametr]);

  return { podglad: czyTrybPodgladu(parametr, rola), rola };
}
