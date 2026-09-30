"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import Logo from "@/components/ui/Logo";
import { PowlokaPanelu } from "@/design-system/szablony/PowlokaPanelu/PowlokaPanelu";
import { api, ApiError } from "@/lib/api";
import type { Role } from "@/lib/home-by-role";
import { menuRamkiUczestnika, W_PRZYGOTOWANIU_KONTO_UCZESTNIKA } from "@/lib/menu/ramka/uczestnik";
import { ukladMenuRamki } from "@/lib/menu/ramka/uklad";
import { NarzedziaPaskaRamki, StopkaRamki, useWylogowanieRamki } from "../WspolneRamki";

interface Ja {
  role?: Role;
  first_name?: string | null;
  last_name?: string | null;
}

/** Podpis roli pod nazwiskiem w menu uczestnika (makieta 2.0.4, karta osoby). */
export const PODPISY_ROLI_UCZESTNIKA: Partial<Record<Role, string>> = {
  volunteer: "wolontariusz",
  student: "student",
};

/**
 * Nowa ramka panelu uczestnika: szablon `PowlokaPanelu` z menu uczestnika
 * wg makiety 2.0.4 (`lib/menu/ramka/uczestnik.ts`), kartą osoby i filtrem
 * roli z `/me`. Górny pasek bez roku programu: zaplecze nie daje uczestnikowi
 * dat edycji (jedyna trasa to `/admin/edition`), więc element jest pominięty,
 * a nie wypełniony atrapą. Strażnika ról nie niesie.
 */
export function PowlokaUczestnika({ children }: { children: ReactNode }) {
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
      .catch((err: unknown) => {
        // 401 czyści token i przekierowuje na /logowanie wewnątrz lib/api.ts.
        if (err instanceof ApiError && err.status === 401) return;
      });
    return () => {
      aktywny = false;
    };
  }, []);

  const imie = ja?.first_name?.trim() || "Uczestnik";
  const nazwisko = ja?.first_name?.trim() ? ja?.last_name?.trim() || undefined : undefined;
  const rola = (ja?.role && PODPISY_ROLI_UCZESTNIKA[ja.role]) || "uczestnik programu";

  const { grupy, grupaZwinieta, liniaKonta } = ukladMenuRamki(
    menuRamkiUczestnika(ja?.role),
    sciezka,
    W_PRZYGOTOWANIU_KONTO_UCZESTNIKA,
  );

  return (
    <PowlokaPanelu
      logo={<Logo title="Fundacja Niepodzielni" />}
      uzytkownik={{ imie, nazwisko, rola }}
      grupy={grupy}
      grupaZwinieta={grupaZwinieta}
      etykietaMenu="Menu — Panel uczestnika"
      liniaKonta={liniaKonta}
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
