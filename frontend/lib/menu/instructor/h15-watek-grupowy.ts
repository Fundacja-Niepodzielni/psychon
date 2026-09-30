import type { MenuEntry } from "../types";

/**
 * Wątek grupowy („prowadzący prowadzi wątek
 * grupowy"). Bez `roles` — jak pozostałe wpisy tego rejestru: cały panel
 * `/prowadzacy` stoi już za `RequireRole allowedRoles={["instructor"]}`
 * w `app/(prowadzacy)/prowadzacy/layout.tsx`, więc `PanelShell` (a z nim
 * menu) w ogóle się nie montuje dla innej roli — `filterMenuByRole` nie
 * jest tu wołane (inaczej niż w panelu uczestnika, dzielonym przez kilka
 * ról). Ta sama zasada („wpis tylko dla ról, którym backend odda
 * dane") jest więc egzekwowany na poziomie layoutu, nie pojedynczego wpisu:
 * `ThreadController.php` (`if (in_array('instructor', $roles, true))` →
 * `$provisioner->ensureGroup($user)`) — tylko rola `instructor` dostaje własny
 * wątek grupowy z `GET /threads`.
 */
const entry: MenuEntry = {
  label: "Wątek grupowy",
  href: "/prowadzacy/watek-grupowy",
  order: 17,
  icon: "messages",
};

export default entry;
