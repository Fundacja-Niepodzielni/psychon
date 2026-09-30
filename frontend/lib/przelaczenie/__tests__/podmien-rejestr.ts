import { vi } from "vitest";
import type { KluczGrupy } from "@/lib/przelaczenie/grupy";

/**
 * Podmienia rejestr przełączenia na czas jednego testu: każda grupa dostaje
 * flagę z `flagi` (brak wpisu = wyłączona). Wołać przed dynamicznym
 * importem modułu, który czyta rejestr; po teście `przywrocRejestr()`.
 * Dzięki temu test sprawdza obie strony flagi bez mutowania współdzielonego
 * rejestru i bez zależności od tego, co rejestr zawiera na dziś.
 */
export function podmienRejestr(flagi: Partial<Record<KluczGrupy, boolean>>): void {
  vi.resetModules();
  vi.doMock("@/lib/przelaczenie/grupy", async (oryginal) => {
    const modul = await oryginal<typeof import("@/lib/przelaczenie/grupy")>();
    const grupy = Object.fromEntries(
      Object.entries(modul.GRUPY).map(([klucz, grupa]) => [
        klucz,
        { ...grupa, wlaczona: flagi[klucz as KluczGrupy] ?? false },
      ]),
    ) as unknown as typeof modul.GRUPY;
    return {
      ...modul,
      GRUPY: grupy,
      celTrasy: (klucz: KluczGrupy, panel: Parameters<typeof modul.celTrasy>[1]) =>
        modul.celTrasyEkranu(grupy[klucz], panel),
    };
  });
}

export function przywrocRejestr(): void {
  vi.doUnmock("@/lib/przelaczenie/grupy");
  vi.resetModules();
}
