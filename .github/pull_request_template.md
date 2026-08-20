## Pakiet

<!-- np. H11 · Staż — dziennik i akceptacje -->

## Co robi ten PR

<!-- 1-3 zdania. Małe PR-y (≤ ~400 linii) — lepiej pięć małych niż jeden wielki. -->

## Checklista (Definition of Done — przewodnik §6)

- [ ] Endpointy zgodne z `docs/hackathon/02-kontrakt-api.md` (koperta, kody, nazwy)
- [ ] Autoryzacja serwerowa (middleware/policy) na każdym endpoincie
- [ ] Walidacja wejścia (FormRequest)
- [ ] Testy: happy path + odmowa dostępu; CI zielone
- [ ] Ekran zgodny z makietą; obsłużony stan pusty i stan błędu
- [ ] Zdarzenia audytowe przez `AuditLog::record` (jeśli pakiet wymaga)
- [ ] Bez nowych zależności composer/npm (albo: zgoda sztabu w komentarzu)
- [ ] Bez zmian w migracjach (albo: zmiana zrobiona przez strażnika schematu)

## Jak sprawdzić

<!-- Kroki dla sztabu: konto demo, adres, co kliknąć / jaki test uruchomić. -->
