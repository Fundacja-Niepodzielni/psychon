import { beforeAll } from "vitest";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";

// Pierwszy import strony i obu treści to zimna transformacja całego drzewa
// komponentów; pod obciążeniem maszyny trwa dłużej niż limit pierwszego testu.
// Rozgrzewamy ją raz, we wstępie z własnym limitem, zamiast w testach.
beforeAll(async () => {
  await import("../page");
  await import("../StaraTresc");
  await import("@/nowy-front/ekran-startowy/EkranStartowy");
}, 30_000);

opiszPodmianeTresci({
  nazwa: "/admin/ekran-startowy",
  klucz: "ekranStartowy",
  plikStrony: "(administracja)/admin/ekran-startowy/page.tsx",
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/ekran-startowy/EkranStartowy").then((m) => m.EkranStartowy),
});
