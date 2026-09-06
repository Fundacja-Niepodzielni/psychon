import type { MenuEntry } from "../types";

/**
 * Pulpit uczestnika — agregacja postępu ścieżki, następnego kroku i skrótów
 * czterech filarów. Stała pozycja tuż po „Start" (H21), przed „Kursy".
 * Nie jest osobnym pakietem HXX: ekran tylko czyta scalone endpointy.
 */
const entry: MenuEntry = {
  label: "Pulpit",
  href: "/panel/pulpit",
  order: 15,
  icon: "dashboard",
};

export default entry;
