import { KursyUczestnika } from "@/nowy-front/kursy-uczestnika-lista/KursyUczestnika";

/**
 * Trasa `/nowy-front/kursy` — „Moje kursy” uczestnika (lista kursów na `ListTemplate`).
 * Odczyty biegną z przeglądarki — powód opisany w `kursy-uczestnika-lista/dane.ts`.
 */
export default function StronaKursow() {
  return <KursyUczestnika />;
}
