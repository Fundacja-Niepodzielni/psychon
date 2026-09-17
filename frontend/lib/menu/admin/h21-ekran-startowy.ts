import type { MenuEntry } from "../types";

/** Wpis menu administracji: edycja treści ekranu „Zacznij tutaj" (onboarding uczestnika). */
const entry: MenuEntry = {
  label: "Ekran startowy",
  href: "/admin/ekran-startowy",
  order: 120,
  icon: "layout",
  section: "konfiguracja",
};

export default entry;
