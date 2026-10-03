import { beforeAll } from "vitest";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";

// Pierwszy import strony i obu treści to zimna transformacja całego drzewa
// komponentów; pod obciążeniem maszyny trwa dłużej niż limit pierwszego testu.
// Rozgrzewamy ją raz, we wstępie z własnym limitem, zamiast w testach.
beforeAll(async () => {
  await import("../page");
  await import("../StaraTresc");
  await import("@/nowy-front/ustawienia-edycji/UstawieniaEdycji");
}, 30_000);

opiszPodmianeTresci({
  nazwa: "/admin/ustawienia",
  klucz: "ustawieniaProgramu",
  plikStrony: "(administracja)/admin/ustawienia/page.tsx",
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/ustawienia-edycji/UstawieniaEdycji").then((m) => m.UstawieniaEdycji),
});
