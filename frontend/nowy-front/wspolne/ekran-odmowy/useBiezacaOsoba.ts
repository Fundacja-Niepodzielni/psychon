"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/klient";
import { ROLE_LABELS } from "@/lib/h18/labels";

export interface BiezacaOsoba {
  /** Imię osoby; `null`, gdy odpowiedź konta go nie niesie. */
  imie: string | null;
  /** Rola po polsku; `null`, gdy odpowiedź konta jej nie niesie albo rola jest nieznana. */
  rola: string | null;
}

function tekst(wartosc: unknown): string | null {
  return typeof wartosc === "string" && wartosc.trim() !== "" ? wartosc.trim() : null;
}

/**
 * Kim jest zalogowana osoba: imię i rola z odczytu konta, który ramka odpytuje już na każdej stronie
 * (odpowiedź jest wspólna, więc to nie jest nowe żądanie sieciowe). Adresu e-mail nie czyta. `null`, dopóki
 * odczyt trwa albo się nie udał — ekran odmowy po prostu pomija wtedy tę część.
 */
export function useBiezacaOsoba(): BiezacaOsoba | null {
  const [osoba, setOsoba] = useState<BiezacaOsoba | null>(null);

  useEffect(() => {
    let aktywny = true;
    api<{ first_name?: unknown; role?: unknown }>("/me")
      .then((konto) => {
        if (!aktywny) return;
        const rola = tekst(konto.role);
        setOsoba({
          imie: tekst(konto.first_name),
          rola: rola === null ? null : (ROLE_LABELS as Record<string, string>)[rola] ?? null,
        });
      })
      .catch(() => {
        if (aktywny) setOsoba(null);
      });
    return () => {
      aktywny = false;
    };
  }, []);

  return osoba;
}
