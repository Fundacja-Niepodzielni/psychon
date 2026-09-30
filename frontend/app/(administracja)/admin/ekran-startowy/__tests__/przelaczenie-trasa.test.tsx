import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";

opiszPodmianeTresci({
  nazwa: "/admin/ekran-startowy",
  klucz: "ekranStartowy",
  plikStrony: "(administracja)/admin/ekran-startowy/page.tsx",
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/ekran-startowy/EkranStartowy").then((m) => m.EkranStartowy),
});
