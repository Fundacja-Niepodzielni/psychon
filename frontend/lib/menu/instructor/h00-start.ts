import type { MenuEntry } from "../types";

/**
 * Wpis startowy panelu prowadzącego (starter). `exact: true`, bo to korzeń
 * sekcji `/prowadzacy` — bez tego pola byłby aktywny na każdej podstronie
 * panelu naraz z właściwym wpisem tej podstrony.
 */
const entry: MenuEntry = {
  label: "Start",
  href: "/prowadzacy",
  order: 10,
  icon: "home",
  exact: true,
};

export default entry;
