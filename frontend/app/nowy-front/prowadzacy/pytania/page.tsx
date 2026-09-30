import { SkrzynkaPytan } from "@/nowy-front/skrzynka-pytan/SkrzynkaPytan";

/**
 * Trasa `/nowy-front/prowadzacy/pytania` — ekran „Skrzynka pytań” (prowadzący)
 * na szablonie `ListTemplate`. Odczyt i odpowiedź biegną z przeglądarki
 * (`SkrzynkaPytan.tsx`, dane w `dane.ts`) — powód opisany tam.
 */
export default function StronaSkrzynkiPytan() {
  return <SkrzynkaPytan />;
}
