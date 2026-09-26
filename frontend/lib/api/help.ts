/**
 * Zgloszenie do pomocy z dowolnego ekranu zalogowanej strefy —
 * `POST /help-messages` (posrednicy `auth:keycloak`, `access.active`).
 *
 * Rola i identyfikator nadawcy pochodza z tokena po stronie backendu —
 * front ich NIGDY nie wysyla w ciele zadania. Jedyne pola to tresc
 * zgloszenia i ekran nadawcy (biezaca sciezka frontu, patrz
 * `components/layout/HelpWidget.tsx`).
 *
 * Backend: `POST /help-messages` w `backend/routes/api/pomoc.php:21`.
 * Atrapa `sendHelpMessage` siedzi w testach `HelpWidget`
 * (`components/layout/__tests__/help-widget-*.test.tsx`).
 */
import { api } from "./klient";

export interface HelpMessagePayload {
  /** Tresc zgloszenia — 1..2000 znakow. */
  content: string;
  /** Sciezka frontu, z ktorej wyslano zgloszenie — 1..200 znakow. */
  screen: string;
}

export interface HelpMessage {
  id: number;
  /** Numer zgloszenia pokazywany nadawcy w potwierdzeniu, np. "POM-000123". */
  reference: string;
  created_at: string;
}

/** Wysyla zgloszenie do pomocy i zwraca jego numer (`reference`). */
export function sendHelpMessage(payload: HelpMessagePayload): Promise<HelpMessage> {
  return api<HelpMessage>("/help-messages", {
    method: "POST",
    body: payload,
  });
}
