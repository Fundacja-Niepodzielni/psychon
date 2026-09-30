import { Sprawy } from "@/nowy-front/sprawy/Sprawy";

/**
 * Trasa `/nowy-front/admin/sprawy` (A-02 „Sprawy") — jedna kolejka decyzji
 * administracji (H03 zgłoszenia, H11 staż, H15 profile psychologów). Odczyt
 * biegnie z przeglądarki (`Sprawy.tsx`) — powód opisany tam i w
 * `nowy-front/formy-stazu/dane.ts`. Stara trasa `/admin/sprawy`
 * (`app/(administracja)/admin/sprawy/page.tsx`) obsługuje inną sprawę
 * (kolejkę superwizji H12) i zostaje bez zmian — przełączenie między starą a
 * nową trasą jest poza zakresem tej zmiany (mechanizm 433).
 */
export default function StronaSpraw() {
  return <Sprawy />;
}
