"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import HelpWidget from "@/components/layout/HelpWidget";
import NotificationBell from "@/components/notifications/NotificationBell";
import Logo from "@/components/ui/Logo";
import { PowlokaPanelu } from "@/design-system/szablony/PowlokaPanelu/PowlokaPanelu";
import { api, endSession } from "@/lib/api";
import { LEGAL_DOCUMENT_LABELS, LEGAL_DOCUMENT_TYPES } from "@/lib/h22/legal-documents";
import { menuRamkiAdministracji } from "@/lib/menu/ramka/administracja";
import { ukladMenuRamki } from "@/lib/menu/ramka/uklad";

interface Ja {
  first_name?: string | null;
  last_name?: string | null;
}

interface Edycja {
  starts_at?: string | null;
  ends_at?: string | null;
}

/** Podpis pod nazwiskiem w menu administracji (makieta 2.0.4, karta osoby). */
export const PODPIS_ROLI_ADMINISTRACJI = "administracja Fundacji";

/**
 * Rok programu z dat edycji: „2026/27”, gdy program przechodzi przez
 * przełom roku, „2026”, gdy mieści się w jednym roku. Brak albo błędne
 * daty — `null` (pasek bez roku, bez komunikatu).
 */
export function rokProgramuZEdycji(edycja: Edycja | null | undefined): string | null {
  const od = Number.parseInt(edycja?.starts_at?.slice(0, 4) ?? "", 10);
  const doRoku = Number.parseInt(edycja?.ends_at?.slice(0, 4) ?? "", 10);
  if (!Number.isFinite(od)) return null;
  if (!Number.isFinite(doRoku) || doRoku <= od) return String(od);
  return `${od}/${String(doRoku).slice(-2)}`;
}

/**
 * Nowa ramka panelu administracji: szablon `PowlokaPanelu` z menu
 * administracji wg makiety 2.0.4 (`lib/menu/ramka/administracja.ts`), kartą
 * osoby z `/me`, rokiem programu z `/admin/edition` i tym samym
 * wylogowaniem co dotychczasowa powłoka. Narzędzia paska (pomoc,
 * powiadomienia) i łącza stopki są te same co w dotychczasowej powłoce.
 * Kliknięcie pozycji menu to przejście po stronie klienta (`router.push`),
 * bez przeładowania dokumentu; pełnym przejściem zostaje tylko wylogowanie
 * pod adres SSO. Strażnika ról nie niesie — stoi nad nią w układzie.
 */
export function PowlokaAdministracji({ children }: { children: ReactNode }) {
  const sciezka = usePathname() ?? "";
  const router = useRouter();
  const [ja, setJa] = useState<Ja | null>(null);
  const [rok, setRok] = useState<string | null>(null);
  const [wylogowywanie, setWylogowywanie] = useState(false);

  useEffect(() => {
    let aktywny = true;
    api<Ja>("/me")
      .then((dane) => {
        if (aktywny) setJa(dane);
      })
      .catch(() => {
        // Brak danych osoby — karta pokazuje sam podpis roli.
      });
    api<Edycja>("/admin/edition")
      .then((dane) => {
        if (aktywny) setRok(rokProgramuZEdycji(dane));
      })
      .catch(() => {
        // Pasek bez roku, bez komunikatu błędu.
      });
    return () => {
      aktywny = false;
    };
  }, []);

  /** Ta sama kolejność co w dotychczasowej powłoce: adres wylogowania SSO przed końcem sesji. */
  async function wyloguj() {
    setWylogowywanie(true);
    try {
      const res = await fetch("/api/auth/end-session-url");
      const { url } = (await res.json()) as { url: string };
      await endSession();
      window.location.assign(url);
    } catch {
      await endSession();
      setWylogowywanie(false);
      router.push("/logowanie");
    }
  }

  const imie = ja?.first_name?.trim() || "Administracja";
  const nazwisko = ja?.first_name?.trim() ? ja?.last_name?.trim() || undefined : undefined;

  const { grupy, grupaZwinieta } = ukladMenuRamki(menuRamkiAdministracji(), sciezka);

  return (
    <PowlokaPanelu
      logo={<Logo title="Fundacja Niepodzielni" />}
      uzytkownik={{ imie, nazwisko, rola: PODPIS_ROLI_ADMINISTRACJI }}
      grupy={grupy}
      grupaZwinieta={grupaZwinieta}
      etykietaMenu="Menu — Administracja"
      onNawigacja={(href) => router.push(href)}
      onWyloguj={wyloguj}
      wylogowywanie={wylogowywanie}
      rokProgramu={rok}
      narzedziaPaska={
        <>
          <HelpWidget />
          <NotificationBell />
        </>
      }
      stopka={
        <>
          <Link href="/deklaracja-dostepnosci">Deklaracja dostępności</Link>
          {LEGAL_DOCUMENT_TYPES.map((typ) => (
            <Link key={typ} href={`/dokumenty-prawne/${typ}`}>
              {LEGAL_DOCUMENT_LABELS[typ]}
            </Link>
          ))}
        </>
      }
    >
      {children}
    </PowlokaPanelu>
  );
}
