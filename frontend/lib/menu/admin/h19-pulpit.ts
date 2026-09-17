import type { MenuEntry } from "../types";

/**
 * Placeholder pakietu H19 (pulpit administracji). `exact: true`, bo to
 * korzeń sekcji `/admin` — bez tego pola byłby aktywny na każdej podstronie
 * administracji naraz z właściwym wpisem tej podstrony.
 */
const entry: MenuEntry = {
  label: "Pulpit",
  href: "/admin",
  order: 10,
  exact: true,
};

export default entry;
