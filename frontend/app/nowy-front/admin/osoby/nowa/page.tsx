import { NowaOsoba } from "@/nowy-front/nowa-osoba/NowaOsoba";

/**
 * Trasa `/nowy-front/admin/osoby/nowa` — „Nowa osoba”
 * (`POST /admin/users`). Odczyt ról i zapis biegną
 * z przeglądarki (`NowaOsoba.tsx`) tokenem z sesji, tak jak pozostałe ekrany
 * administracji nowego frontu.
 */
export default function StronaNowejOsoby() {
  return <NowaOsoba />;
}
