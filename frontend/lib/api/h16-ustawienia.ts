/**
 * H16 — ustawienia powiadomień administracji (`GET`/`PATCH`
 * `/admin/notification-settings`, `NotificationSettingsController`,
 * `backend/routes/api/h16.php:38-39`). Dostęp: `project_manager`,
 * `super_admin` — ta sama bramka co `/admin/emails`.
 *
 * Kształt zgodny z zapleczem (`NotificationSettings::TYPES`, 20 pozycji):
 * `types` jest LISTĄ `{type, enabled}` w kolejności serwera — front jej nie
 * sortuje ani nie filtruje. `supervision_reminder` to osobny blok (flaga +
 * `send_at` w postaci `HH:00`), bo `supervision.reminder` nie jest zwykłym
 * typem z listy `types`.
 *
 * `PATCH` jest częściowy: `types` niesie WYŁĄCZNIE zmienione wpisy,
 * `supervision_reminder` WYŁĄCZNIE zmienione klucze — nigdy pełny stan.
 */

import { api } from "./klient";

export interface TypPowiadomienia {
  type: string;
  enabled: boolean;
}

export interface PrzypomnienieSuperwizji {
  enabled: boolean;
  send_at: string;
}

export interface UstawieniaPowiadomien {
  types: TypPowiadomienia[];
  supervision_reminder: PrzypomnienieSuperwizji;
}

export interface PatchUstawienPowiadomien {
  types?: TypPowiadomienia[];
  supervision_reminder?: Partial<PrzypomnienieSuperwizji>;
}

export function fetchNotificationSettings(): Promise<UstawieniaPowiadomien> {
  return api<UstawieniaPowiadomien>("/admin/notification-settings");
}

export function updateNotificationSettings(
  patch: PatchUstawienPowiadomien,
): Promise<UstawieniaPowiadomien> {
  return api<UstawieniaPowiadomien>("/admin/notification-settings", {
    method: "PATCH",
    body: patch,
  });
}
