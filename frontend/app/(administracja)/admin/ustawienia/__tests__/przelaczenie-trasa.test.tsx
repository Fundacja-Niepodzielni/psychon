import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";

opiszPodmianeTresci({
  nazwa: "/admin/ustawienia",
  klucz: "ustawieniaProgramu",
  plikStrony: "(administracja)/admin/ustawienia/page.tsx",
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/ustawienia-edycji/UstawieniaEdycji").then((m) => m.UstawieniaEdycji),
});
