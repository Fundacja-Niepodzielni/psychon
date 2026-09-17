import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/api";
import { ACTION_LABELS } from "@/lib/h20/labels";

/**
 * Rejestr zdarzeń audytu (H20) jest dziś wypisany ręcznie w trzech miejscach:
 * miejsca wywołania `AuditLog::record(...)` w zapleczu, stała
 * `AuditIndexRequest::ACTIONS` i dwa słowniki frontu (`AUDIT_ACTIONS`,
 * `ACTION_LABELS`). Nic dotąd nie wiązało frontu z zapleczem — istniejący
 * test (`labels.test.ts`) porównuje wyłącznie oba słowniki frontu między
 * sobą, więc literówka wpisana jednym ruchem do obu naraz przechodzi bez
 * ostrzeżenia.
 *
 * Źródłem prawdy jest `AuditIndexRequest::ACTIONS`, nie same miejsca zapisu
 * `AuditLog::record(...)`:
 *   - komentarz przy stałej wprost deklaruje ją jako "kontrakt §3.2 (jedyne
 *     źródło prawdy o audycie)" i zastrzega zmianę wyłącznie dla strażnika
 *     kontraktu — to jedyne miejsce w zapleczu objęte taką ochroną;
 *   - `AuditLog::record(...)` nie ma żadnego mechanizmu, który wymuszałby
 *     zgodność wpisywanego sluga z tą listą (nie ma tam `Rule::in`, enuma ani
 *     żadnej walidacji) — dopisanie nowego wywołania z nowym slugiem w
 *     kontrolerze niczego nie zepsuje i niczego nie ostrzeże, wpis trafi do
 *     bazy, ale nie będzie filtrowalny ani nazwany we froncie;
 *   - dziś (mierzone poniżej) obie listy się zgadzają 1:1 — 30 unikalnych
 *     sluganow w wywołaniach `record()`, 30 pozycji w `ACTIONS` — ale to
 *     tylko potwierdza, że nikt jeszcze nie dopisał wywołania bez
 *     zaktualizowania `ACTIONS`. Gdyby ktoś to zrobił, `ACTIONS` (a więc i
 *     ten test) by o tym nie wiedział — i to jest zamierzone: `ACTIONS` jest
 *     bramką, którą trzeba świadomie przejść, `record()` nią nie jest.
 *
 * Test frontu czyta plik zaplecza jako tekst (nie ma tu generatora ani
 * wystawionego przez zaplecze API z listą sluganow). Wybrano stronę frontu,
 * bo to tu żyją obiekty pod testem (`AUDIT_ACTIONS`, `ACTION_LABELS`) i tu
 * już działa runner (vitest) zdolny czytać dowolne pliki tekstowe z
 * repozytorium — uruchomienie PHPUnit po to, by parsować TS jako tekst, nie
 * dawałoby żadnej przewagi.
 *
 * Koszt tego wyboru: sprzężenie przez konwencję tekstu PHP, nie przez
 * prawdziwy parser ani wspólnie generowany plik. Przeformatowanie stałej
 * `ACTIONS` w zapleczu (np. inny styl cudzysłowów, złożenie w jedną linię
 * bez przecinków między elementami) może zepsuć wyrażenie regularne poniżej
 * i dać fałszywy czerwony albo fałszywy zielony — to nie jest wiązanie na
 * poziomie typów, tylko najbliższe dostępne bez zmiany kodu produkcyjnego.
 *
 * Poprawka po odbiorze: pierwsza wersja dopasowywała `ACTIONS\s*=\s*\[` bez
 * granicy słowa, więc stała siostrzana o nazwie kończącej się na `ACTIONS`
 * (np. `EXPORT_ACTIONS`) przejmowała dopasowanie — regex trafiał w jej
 * blok, nie w blok właściwej stałej, i test świecił zielono, patrząc na
 * cudzy przedmiot. `\bACTIONS\b` nie łapie tego przypadku, bo `_` liczy się
 * jako znak słowa — między `_` a `A` w `EXPORT_ACTIONS` nie ma granicy.
 * Druga, tańsza kontrola niżej liczy dosłowne wystąpienia deklaracji samej
 * nazwy `ACTIONS` (z granicą słowa, tuż przed znakiem `=`) w całym pliku i
 * wymaga dokładnie jednego. Celowo NIE liczy samego słowa `ACTIONS` wszędzie
 * w pliku — plik legalnie odwołuje się do stałej też jako `self::ACTIONS)`
 * w `rules()`, więc "dokładnie jedno wystąpienie słowa" byłoby fałszywym
 * alarmem na czystym kodzie. Wymóg "ACTIONS" bezpośrednio przed `=` łapie
 * każdą przyszłą stałą siostrzaną o tej samej końcówce nazwy (np.
 * `EXPORT_ACTIONS = [...]` nie pasuje, bo `_` przed `A` psuje granicę
 * słowa), niezależnie od tego, czy zepsułaby też pierwszy regex.
 */

const backendActionsFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../backend/app/Http/Requests/H20/AuditIndexRequest.php",
);

const DEKLARACJA_STALEJ = /\bACTIONS\s*=/g;

function policzDeklaracje(tresc: string): number {
  return (tresc.match(DEKLARACJA_STALEJ) ?? []).length;
}

function czytajZrodloPrawdy(tresc: string): string[] {
  const blok = tresc.match(/\bACTIONS\b\s*=\s*\[([\s\S]*?)\];/);
  if (!blok) {
    throw new Error(
      "Nie znaleziono stałej ACTIONS w AuditIndexRequest.php — zmieniono format pliku, dopasuj wyrażenie regularne w teście.",
    );
  }
  const dopasowania = blok[1].match(/'([a-z_]+\.[a-z_]+)'/g) ?? [];
  return dopasowania.map((slug) => slug.slice(1, -1));
}

describe("słowniki frontu audytu vs. źródło prawdy zaplecza (AuditIndexRequest::ACTIONS)", () => {
  const tresc = readFileSync(backendActionsFile, "utf-8");
  const zrodloPrawdy = czytajZrodloPrawdy(tresc);

  it("źródło prawdy nie jest puste (kontrola, że parser czyta właściwy plik)", () => {
    expect(zrodloPrawdy.length).toBeGreaterThan(0);
  });

  it("deklaracja `ACTIONS =` występuje w pliku dokładnie raz (brak stałej siostrzanej, która przejęłaby dopasowanie)", () => {
    expect(policzDeklaracje(tresc)).toBe(1);
  });

  it("AUDIT_ACTIONS zawiera dokładnie te same sluganowy co AuditIndexRequest::ACTIONS", () => {
    const zbiorZrodla = new Set(zrodloPrawdy);
    const zbiorFrontu = new Set(AUDIT_ACTIONS);

    const brakujaceWeFroncie = zrodloPrawdy.filter(
      (slug) => !zbiorFrontu.has(slug as (typeof AUDIT_ACTIONS)[number]),
    );
    const nadmiaroweWeFroncie = AUDIT_ACTIONS.filter(
      (slug) => !zbiorZrodla.has(slug),
    );

    expect(brakujaceWeFroncie).toEqual([]);
    expect(nadmiaroweWeFroncie).toEqual([]);
  });

  it("każdy slug ze źródła prawdy ma etykietę w ACTION_LABELS", () => {
    const bezEtykiety = zrodloPrawdy.filter(
      (slug) => !(slug in ACTION_LABELS),
    );
    expect(bezEtykiety).toEqual([]);
  });

  it("liczba pozycji w źródle prawdy zgadza się z liczbą pozycji we froncie (1:1, bez duplikatów po obu stronach)", () => {
    expect(new Set(zrodloPrawdy).size).toBe(zrodloPrawdy.length);
    expect(zrodloPrawdy.length).toBe(AUDIT_ACTIONS.length);
    expect(zrodloPrawdy.length).toBe(Object.keys(ACTION_LABELS).length);
  });
});
