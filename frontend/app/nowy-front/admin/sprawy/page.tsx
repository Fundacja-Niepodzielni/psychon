import { Sprawy } from "@/nowy-front/sprawy/Sprawy";

/**
 * Trasa `/nowy-front/admin/sprawy` (A-02 „Sprawy") — jedna kolejka decyzji
 * administracji (H03 zgłoszenia, H11 staż, H15 profile psychologów). Odczyt
 * biegnie z przeglądarki (`Sprawy.tsx`) — powód opisany tam i w
 * `nowy-front/formy-stazu/dane.ts`. Ten sam ekran stoi też pod adresem
 * `/admin/sprawy` (`app/(administracja)/admin/sprawy/page.tsx`, grupa
 * przełączenia `sprawy`); trasa poligonu zostaje obok.
 */
export default function StronaSpraw() {
  return <Sprawy />;
}
