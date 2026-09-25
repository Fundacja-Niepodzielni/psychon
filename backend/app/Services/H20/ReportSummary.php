<?php

namespace App\Services\H20;

use App\Models\Application;
use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\User;
use App\Services\H19\DashboardSummary;
use App\Support\ProgressAggregator;
use App\Support\Settings;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Raport edycji (H20, GET /admin/report). Kryterium ★1: te same liczby co
 * karta osoby (`ProgressAggregator`) i pulpit (`DashboardSummary` — H19).
 *
 * `active`/`completed`/`certificates_issued` wołają wprost
 * `DashboardSummary::build()` zamiast liczyć te same COUNT-y drugi raz —
 * gwarancja równości przez wspólny kod, nie przez „policzone tak samo".
 *
 * Zakres dat `$from`/`to` zawęża godziny i konsultacje po
 * `internship_entries.date` (kolumna, po której raport już agreguje — patrz
 * sumy niżej). Liczniki pulpitu (`admitted`/`active`/`completed`/
 * `certificates_issued`) NIE są filtrowane — pochodzą ze stanu bieżącego
 * (`DashboardSummary`/`Application::accepted()`), nie z dziennika zdarzeń
 * z własną datą; to alternatywna interpretacja „okresu", tu świadomie
 * pominięta jako wymagająca osobnej zmiany w H19.
 *
 * `closing()` — raport zamknięcia edycji: wywołuje ten sam `people()` (ta
 * sama budowa wiersza co `build()`, więc te same liczby co karta osoby —
 * bez osobnej ścieżki liczenia) zawężony do `edition_id` wskazanej edycji
 * zamiast do zakresu dat, a `summary` (`total`/`certified`/`not_certified`)
 * podlicza tę samą listę zamiast wołać osobne zapytania — koperta odpowiedzi
 * węższa niż `build()`, dopasowana do kontraktu pary frontowej (patrz
 * docblock `closing()` niżej).
 */
final class ReportSummary
{
    /**
     * Etap ścieżki tej samej osoby, jeden na wiersz (nie mylić z listą
     * etapów-kursów `pathStages` we froncie). Słownik NIE jest nowym
     * wymysłem: to kolejność czterech warunków certyfikatu z
     * `CertificateConditions` (`courses` → `internship` → `supervision`
     * → `workshop`, plik `Support/H13/CertificateConditions.php:36-63`) plus
     * dwa dalsze stany po spełnieniu wszystkich czterech — „gotowa" i
     * „certyfikat" (decyzja właściciela z 23.09.2026, patrz `stage()`).
     * Etap to wartość punktowa (aktualny stan `ProgressAggregator::for()`),
     * NIE zależy od `$from`/`$to` raportu — te dwa parametry zawężają
     * wyłącznie sumy z dziennika stażu (`acceptedEntries()` niżej), a
     * `ProgressAggregator` liczy godziny/obecności bez filtra dat.
     */
    private const STAGE_LABELS = [
        'kurs' => 'Kursy i testy',
        'staz' => 'Staż',
        'superwizja' => 'Superwizje',
        'warsztat' => 'Warsztat stacjonarny',
        'gotowa' => 'Gotowa do certyfikatu',
        'certyfikat' => 'Certyfikat',
    ];

    /**
     * @return array{
     *     summary: array{
     *         admitted: int, active: int, completed: int,
     *         hours_accepted_total: string, hours_accepted_average: string,
     *         consultations_total: int, certificates_issued: int, people_with_passed_test: int,
     *     },
     *     people: list<array{
     *         id: int, first_name: string, last_name: string, role: string,
     *         status: string, hours_accepted: string, consultations: int,
     *         certificate_issued: bool, stage: string, stage_label: string,
     *         tests_passed: int,
     *     }>,
     * }
     */
    public static function build(?string $from = null, ?string $to = null): array
    {
        $dashboard = DashboardSummary::build();

        $hoursTotal = (float) self::acceptedEntries($from, $to)->sum('hours');
        $consultationsTotal = (int) self::acceptedEntries($from, $to)->sum('consultations_count');
        $active = $dashboard['counters']['participants'];

        // Dwie RÓŻNE wielkości, dwie różne nazwy (naprawa rozjazdu: wcześniej
        // obie nosiły nazwę `tests_passed`, mimo że liczą co innego — osoby
        // kontra testy — i na seedzie demo dawały różne liczby, 2 i 4).
        // `summary.people_with_passed_test` liczy OSOBY z co najmniej jednym
        // zaliczonym testem, z TEJ SAMEJ kolekcji `people`, którą odpowiedź i
        // tak zwraca (kryterium ★1) — nie osobnym zapytaniem po
        // `ProgressAggregator::passedTestsCount()` drugi raz.
        // `people[].tests_passed` (niżej, `people()`) to LICZBA TESTÓW danej
        // osoby — osobna wielkość, patrz próba
        // `ReportTest::test_report_summary_people_with_passed_test_is_distinct_from_the_row_sum_of_tests_passed`,
        // która pilnuje, że ktoś znowu nie zlepi tych dwóch liczb w jedną.
        // `tests_passed` w wierszu osoby nie zależy od `$from`/`$to` (patrz
        // `people()` niżej), więc to podliczenie jest poprawne niezależnie
        // od zakresu dat raportu.
        $people = self::people($from, $to)->all();

        return [
            'summary' => [
                'admitted' => Application::accepted()->count(),
                'active' => $active,
                'completed' => $dashboard['counters']['completed'],
                'hours_accepted_total' => ProgressAggregator::formatDecimal($hoursTotal),
                'hours_accepted_average' => ProgressAggregator::formatDecimal(
                    $active > 0 ? $hoursTotal / $active : 0.0,
                ),
                'consultations_total' => $consultationsTotal,
                'certificates_issued' => $dashboard['counters']['certificates'],
                'people_with_passed_test' => count(array_filter($people, static fn (array $row): bool => $row['tests_passed'] > 0)),
            ],
            'people' => $people,
        ];
    }

    /**
     * Raport zamknięcia wskazanej edycji (kryterium ★2: „raport zamknięcia
     * edycji" jako osobne działanie), węższy niż koperta `build()`: `edition`
     * (z `EditionResource`, tylko pola potrzebne frontowi), `summary` liczone
     * z tej samej listy `people` co odpowiedź (kryterium ★1 — jedno źródło:
     * `total`/`certified`/`not_certified` to nie osobne zapytania, tylko
     * podliczenie kolekcji poniżej), `people` zawężone do `edition_id` przez
     * `people()` i przycięte do pól, których front używa (bez `status`,
     * `hours_accepted`, `consultations`, `tests_passed` — „zamknięcie" pokazuje
     * etap i certyfikat, nie dziennik stażu). `$from`/`$to` świadomie
     * pominięte: „zamknięcie" to stan na koniec edycji, nie wycinek
     * dziennika.
     *
     * UWAGA (poprawka po odbiorze PR #34): realny kontrakt frontu to
     * `frontend/lib/api/h20.ts` — `frontend/lib/api/raport.ts` i typ
     * `ClosingReportData`, na które wcześniej wskazywał ten komentarz, NIE
     * ISTNIEJĄ ani na tym czubku, ani na `sprint-2`. `h20.ts` dziś w ogóle
     * nie deklaruje typu dla odpowiedzi zamknięcia edycji, a `ReportPersonRow`
     * z tego pliku nie ma pól `status` ani `tests_passed` — kształt `closing()`
     * poniżej jest więc zaprojektowany pod kontrakt, którego jeszcze nie ma
     * po stronie frontu (opis PR wypisuje to wprost, nie dodaję tu plików
     * frontu — poza zakresem tej poprawki).
     *
     * @return array{
     *     edition: array{id: int, name: string, ends_at: string|null},
     *     summary: array{total: int, certified: int, not_certified: int},
     *     people: list<array{
     *         id: int, first_name: string, last_name: string, role: string,
     *         stage: string, stage_label: string, certificate_issued: bool,
     *     }>,
     * }
     */
    public static function closing(int $editionId): array
    {
        // `ReportClosingRequest` już sprawdza `exists:editions,id` — model
        // tu i tak istnieje; `findOrFail` to tylko druga linia obrony.
        $edition = Edition::findOrFail($editionId);

        $people = self::people(null, null, $editionId)->all();
        $certified = count(array_filter($people, static fn (array $row): bool => $row['certificate_issued']));
        $total = count($people);

        return [
            'edition' => [
                'id' => $edition->id,
                'name' => $edition->name,
                'ends_at' => $edition->ends_at?->toDateString(),
            ],
            'summary' => [
                'total' => $total,
                'certified' => $certified,
                'not_certified' => $total - $certified,
            ],
            'people' => array_map(static fn (array $row): array => [
                'id' => $row['id'],
                'first_name' => $row['first_name'],
                'last_name' => $row['last_name'],
                'role' => $row['role'],
                'stage' => $row['stage'],
                'stage_label' => $row['stage_label'],
                'certificate_issued' => $row['certificate_issued'],
            ], $people),
        ];
    }

    /**
     * Zestawienie imienne — jedno źródło dla ekranu raportu i CSV. Kształt
     * elementu jak w `build()` @return (`people: list<array{...}>` wyżej) —
     * tu wypisany wprost zamiast owinięty w luźny `array<string, mixed>`,
     * bo `Collection`'s TValue nie jest kowariantny: adnotacja szersza niż
     * to, co `->map()` faktycznie zwraca, i tak nie przechodzi PHPStan,
     * więc ma sens tylko dokładny opis rzeczywistego kształtu wiersza.
     *
     * @return Collection<int, array{
     *     id: int, first_name: string, last_name: string, role: string,
     *     status: string, hours_accepted: string, consultations: int,
     *     certificate_issued: bool, stage: string, stage_label: string,
     *     tests_passed: int,
     * }>
     */
    public static function people(?string $from = null, ?string $to = null, ?int $editionId = null): Collection
    {
        $certifiedUserIds = User::query()
            ->whereHas('certificates')
            ->pluck('id')
            ->flip();

        // Progi z aktywnej edycji pobrane RAZ przed pętlą (nie przez
        // `CertificateConditions::for()` per osoba — ten wołałby
        // `Settings::activeEdition()`, czyli dodatkowe zapytanie do
        // `editions`, dla każdego wiersza listy).
        $hoursRequired = (float) Settings::edition('internship_hours_required');
        $supervisionRequired = (int) Settings::edition('supervision_required_count');

        $query = User::query()->whereIn('role', ['volunteer', 'student']);

        // `$editionId` — użyty wyłącznie przez `closing()` (raport
        // zamknięcia jednej wskazanej edycji); `build()` woła `people()`
        // bez niego, jak dotąd, bo raport bieżący pokazuje wszystkie osoby
        // niezależnie od edycji.
        if ($editionId !== null) {
            $query->where('edition_id', $editionId);
        }

        return $query
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get()
            ->map(function (User $user) use ($from, $to, $certifiedUserIds, $hoursRequired, $supervisionRequired): array {
                $certificateIssued = $certifiedUserIds->has($user->id);

                // PHPStan infers the six `stage()` return statements as a
                // literal-string union (narrower than the declared `string`)
                // and, through it, a matching literal union for the
                // `STAGE_LABELS` lookup below — both stricter than the
                // `Collection<int, array{..., stage: string, stage_label:
                // string}>` this method promises, and `Collection`'s TValue
                // is not covariant, so a narrower actual type still fails
                // the check. Widened here, once, to what the return type
                // already documents.
                /** @var string $stage */
                $stage = self::stage(ProgressAggregator::for($user), $hoursRequired, $supervisionRequired, $certificateIssued);
                /** @var string $stageLabel */
                $stageLabel = self::STAGE_LABELS[$stage];

                return [
                    'id' => $user->id,
                    'first_name' => $user->first_name,
                    'last_name' => $user->last_name,
                    'role' => $user->role,
                    // `active`/`blocked` (`users.status`, migracja tabeli
                    // `users`) — pole z kontraktu pary frontowej, nie liczone
                    // niczym: zwykły atrybut modelu.
                    'status' => $user->status,
                    'hours_accepted' => ProgressAggregator::formatDecimal(
                        (float) self::acceptedEntries($from, $to, $user->id)->sum('hours'),
                    ),
                    'consultations' => (int) self::acceptedEntries($from, $to, $user->id)->sum('consultations_count'),
                    'certificate_issued' => $certificateIssued,
                    'stage' => $stage,
                    'stage_label' => $stageLabel,
                    // Osobne pole, nie doklejone do `stage`/`stage_label`
                    // (kryterium ★1) — `ProgressAggregator::passedTestsCount()`,
                    // to samo źródło co `passed_tests_count` karty warunków
                    // certyfikatu (`Support/H13/CertificateConditions.php:31,115`).
                    // Nazwa pola `tests_passed` (nie `passed_tests_count`) —
                    // decyzja backendu, NIE dopasowanie do frontu: realny
                    // kontrakt (`frontend/lib/api/h20.ts`, `ReportPersonRow`)
                    // dziś NIE MA tego pola w ogóle (ani `status` w tym
                    // wierszu, ani `summary.people_with_passed_test` wyżej w
                    // `build()` — patrz opis PR, sekcja o polach bez
                    // odpowiednika po stronie frontu).
                    'tests_passed' => ProgressAggregator::passedTestsCount($user),
                ];
            })
            ->values();
    }

    /**
     * Pierwszy niespełniony warunek z `CertificateConditions` (ten sam
     * porządek: kursy → staż → superwizje → warsztat) rozstrzyga etap —
     * ta część reguły się nie zmienia. Dopiero gdy wszystkie cztery warunki
     * są spełnione, o etapie decyduje to, czy dokument certyfikatu już
     * istnieje: jest wiersz w `certificates` (`$certificateIssued`) — etap
     * „certyfikat", nie ma — „gotowa" (decyzja właściciela z 23.09.2026).
     * Posiadanie dokumentu NIE przeskakuje niespełnionego warunku: osoba
     * z certyfikatem, która np. nie ma zaliczonego warsztatu, dostaje etap
     * „warsztat" — dlatego warunek na `$certificateIssued` jest ostatni,
     * po wszystkich czterech sprawdzeniach, nigdy przed nimi.
     * Liczby z `ProgressAggregator::for()`, tak jak karta osoby i pulpit
     * — żadna nowa reguła biznesowa.
     *
     * @param  array{courses_done:int, courses_total:int, hours_accepted:string, supervision_present:int, workshop_done:bool, reliability_percent:int|null}  $progress
     */
    private static function stage(array $progress, float $hoursRequired, int $supervisionRequired, bool $certificateIssued): string
    {
        if ($progress['courses_total'] === 0 || $progress['courses_done'] < $progress['courses_total']) {
            return 'kurs';
        }

        if ((float) $progress['hours_accepted'] < $hoursRequired) {
            return 'staz';
        }

        if ($progress['supervision_present'] < $supervisionRequired) {
            return 'superwizja';
        }

        if (! $progress['workshop_done']) {
            return 'warsztat';
        }

        return $certificateIssued ? 'certyfikat' : 'gotowa';
    }

    /**
     * Wpisy stażu ze statusem `accepted`, opcjonalnie zawężone datą wpisu
     * (`internship_entries.date`, `$from`/`to` w formacie ISO, oba brzegi
     * włącznie) i osobą.
     */
    private static function acceptedEntries(?string $from, ?string $to, ?int $userId = null): Builder
    {
        $query = InternshipEntry::where('status', 'accepted');

        if ($userId !== null) {
            $query->where('user_id', $userId);
        }

        if ($from !== null) {
            $query->whereDate('date', '>=', $from);
        }

        if ($to !== null) {
            $query->whereDate('date', '<=', $to);
        }

        return $query;
    }
}
