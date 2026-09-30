"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import Logo from "@/components/ui/Logo";
import { PowlokaPanelu } from "@/design-system/szablony/PowlokaPanelu/PowlokaPanelu";
import { api } from "@/lib/api";
import { czyPozycjaBiezaca } from "@/lib/menu/ramka/administracja";
import { menuRamkiProwadzacego, W_PRZYGOTOWANIU_KONTO_PROWADZACEGO } from "@/lib/menu/ramka/prowadzacy";
import { NarzedziaPaskaRamki, StopkaRamki, useWylogowanieRamki } from "../WspolneRamki";

interface Ja {
  first_name?: string | null;
  last_name?: string | null;
}

/** Podpis roli pod nazwiskiem w menu prowadzącego (makieta 2.0.4, karta osoby). */
export const PODPIS_ROLI_PROWADZACEGO = "prowadzący";

/**
 * Nowa ramka panelu prowadzącego: szablon `PowlokaPanelu` z menu
 * prowadzącego wg makiety 2.0.4 (`lib/menu/ramka/prowadzacy.ts`) i kartą
 * osoby z `/me`. Górny pasek bez roku programu: zaplecze nie daje
 * prowadzącemu dat edycji (jedyna trasa to `/admin/edition`), więc element
 * jest pominięty, a nie wypełniony atrapą. Strażnika ról nie niesie — stoi
 * nad nią w układzie.
 */
export function PowlokaProwadzacego({ children }: { children: ReactNode }) {
  const sciezka = usePathname() ?? "";
  const router = useRouter();
  const [ja, setJa] = useState<Ja | null>(null);
  const { wyloguj, wylogowywanie } = useWylogowanieRamki();

  useEffect(() => {
    let aktywny = true;
    api<Ja>("/me")
      .then((dane) => {
        if (aktywny) setJa(dane);
      })
      .catch(() => {
        // Brak danych osoby — karta pokazuje sam podpis roli.
      });
    return () => {
      aktywny = false;
    };
  }, []);

  const imie = ja?.first_name?.trim() || "Prowadzący";
  const nazwisko = ja?.first_name?.trim() ? ja?.last_name?.trim() || undefined : undefined;

  const grupy = menuRamkiProwadzacego().map((grupa) => ({
    naglowek: grupa.naglowek,
    liniaWPrzygotowaniu: grupa.wPrzygotowaniu,
    pozycje: grupa.pozycje.map((p) => ({
      ikona: p.ikona,
      etykieta: p.etykieta,
      href: p.href,
      biezaca: czyPozycjaBiezaca(p, sciezka),
    })),
  }));

  return (
    <PowlokaPanelu
      logo={<Logo title="Fundacja Niepodzielni" />}
      uzytkownik={{ imie, nazwisko, rola: PODPIS_ROLI_PROWADZACEGO }}
      grupy={grupy}
      etykietaMenu="Menu — Panel prowadzącego"
      liniaKonta={W_PRZYGOTOWANIU_KONTO_PROWADZACEGO}
      onNawigacja={(href) => router.push(href)}
      onWyloguj={wyloguj}
      wylogowywanie={wylogowywanie}
      narzedziaPaska={<NarzedziaPaskaRamki />}
      stopka={<StopkaRamki />}
    >
      {children}
    </PowlokaPanelu>
  );
}
