# Pomiar starych ekranów weryfikacji i certyfikatu

Ścieżki starych plików względem `frontend/`; nowe pliki w tym katalogu.

## `/weryfikacja` — `app/weryfikacja/page.tsx` → `Weryfikacja.tsx`

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| nagłówek „Weryfikacja certyfikatu” i opis z przykładem | app/weryfikacja/page.tsx:70–71 | `Heading stopien={1}` + `Text` |
| pole „Numer certyfikatu”, wymagane, podpowiedź `NP/2026/001` | app/weryfikacja/page.tsx:76–82 | `Field` (etykieta, `wymagane`, `placeholder`) |
| przycisk „Sprawdź” (w trakcie zajęty) | app/weryfikacja/page.tsx:83–85 | `Button type="submit"`, w trakcie `aria-busy` |
| numer obcięty z białych znaków, pusty → nic | app/weryfikacja/page.tsx:62–63 | to samo |
| numer spoza kształtu → „nie znaleziono” bez żądania, wynik znika | app/weryfikacja/page.tsx:27–33 | `czyNumerCertyfikatu()` — ten sam pomocnik |
| żądanie `api(sciezkaWeryfikacjiNumeru(numer))` | app/weryfikacja/page.tsx:41 | to samo |
| 404 → „Nie znaleziono certyfikatu o podanym numerze.”, wynik znika | app/weryfikacja/page.tsx:49–51, 92 | błąd pola (`ErrorText`, `role="alert"`, `aria-describedby`) |
| inna odpowiedź → awaria obok wyniku, „Spróbuj ponownie” z tym samym numerem | app/weryfikacja/page.tsx:53, 96–99 | `Komunikat` + przycisk |
| karta wyniku: „Certyfikat”, numer, Ważny/Unieważniony, Edycja, Data wydania, karta ciepła przy unieważnionym | components/certyfikat/VerificationCard.tsx:25–45 | `KartaWyniku.tsx` |

## `/certyfikat` — `app/certyfikat/page.tsx` → `CertyfikatPubliczny.tsx`

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| nagłówek „Certyfikat programu” i opis | app/certyfikat/page.tsx:100–101 | `Heading stopien={1}` + `Text` |
| wczytywanie w zawieszeniu „Wczytywanie…” | app/certyfikat/page.tsx:143 | `Suspense` + `Wczytywanie` |
| cel z adresu (`token` przed `number`, kształt, obcięcie) | app/certyfikat/page.tsx:35–50, 53 | `celZAdresu()` (`logika.ts`) |
| brak numeru: komunikat z odnośnikiem do `/weryfikacja` | app/certyfikat/page.tsx:105–113 | `Komunikat` + `Link` |
| wartość spoza kształtu: „nie znaleziono”, bez żądania | app/certyfikat/page.tsx:115–116 | to samo |
| żądanie `api(ścieżka)` | app/certyfikat/page.tsx:69 | to samo |
| „Sprawdzanie…” dopóki brak wyniku | app/certyfikat/page.tsx:119 | `Wczytywanie` |
| wynik, 404, awaria (wynik zostaje) i ponowienie z szkieletem | app/certyfikat/page.tsx:72–87, 120–133 | te same stany i ten sam licznik ponowień |

## Różnice

- Data wydania w formacie wspólnego formatera nowego frontu („30 września 2026”,
  strefa warszawska) zamiast „30.09.2026”.
- Na `/weryfikacja` „nie znaleziono” stoi przy polu (błąd powiązany z polem), a nie
  jako osobny komunikat pod kartą — treść ta sama, nadal ogłaszana od razu.
- W czasie zawieszenia `/certyfikat` widać już nagłówek i opis (dawniej sam szkielet).
- Obszar wyników jest ogłaszany czytnikowi (`aria-live="polite"`).
