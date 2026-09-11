import { describe, expect, it } from "vitest";
import { participantMenu } from "@/lib/menu/participant";
import { adminMenu } from "@/lib/menu/admin";
import { instructorMenu } from "@/lib/menu/instructor";
import type { MenuEntry } from "@/lib/menu/types";

/**
 * Dwa wpisy z tą samą wartością `order` w jednym rejestrze menu dają wynik
 * zależny WYŁĄCZNIE od kolejności w tablicy przekazanej do `sortMenu` w
 * `index.ts` (sortowanie jest stabilne) — czyli od przypadku, nie od
 * świadomej decyzji o kolejności. Ten test mierzy WARTOŚCI `order`, nie
 * wyrenderowany ekran: zbiór wartości ma być tej samej liczności co lista
 * wpisów w każdym rejestrze roli.
 */

const rejestry: Record<string, MenuEntry[]> = {
  uczestnik: participantMenu,
  administracja: adminMenu,
  prowadzacy: instructorMenu,
};

describe("rejestry menu — unikalne wartości order", () => {
  it.each(Object.entries(rejestry))(
    "%s: żadne dwa wpisy nie dzielą tej samej wartości order",
    (_nazwaRejestru, menu) => {
      const wartosci = menu.map((wpis) => wpis.order);
      const duplikaty = wartosci.filter((wartosc, indeks) => wartosci.indexOf(wartosc) !== indeks);

      expect(duplikaty).toEqual([]);
    },
  );
});
