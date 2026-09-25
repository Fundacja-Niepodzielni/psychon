<?php

namespace App\Services\H20;

use App\Models\Application;
use App\Models\Certificate;
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
 * `closing()` — raport zamknięcia edycji: ten sam `people()` (ta sama
 * budowa wiersza co `build()`, więc te same liczby co karta osoby — bez
 * osobnej ścieżki liczenia), zawężony do `edition_id` wskazanej edycji
 * zamiast do zakresu dat. Liczniki `summary` liczone tu wprost (nie przez
 * `DashboardSummary::build()`, bo ten nie przyjmuje edycji — sygnatura
 * H19, poza zakresem tej zmiany), ale tymi samymi warunkami co pulpit,
 * dopisanymi o `edition_id`.
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
     *         consultations_total: int, certificates_issued: int,
     *     },
     *     people: list<array{
     *         id: int, first_name: string, last_name: string, role: string,
     *         hours_accepted: string, consultations: int, certificate_issued: bool,
     *         stage: string, stage_label: string, passed_tests_count: int,
     *     }>,
     * }
     */
    public static function build(?string $from = null, ?string $to = null): array
    {
        $dashboard = DashboardSummary::build();

        $hoursTotal = (float) self::acceptedEntries($from, $to)->sum('hours');
        $consultationsTotal = (int) self::acceptedEntries($from, $to)->sum('consultations_count');
        $active = $dashboard['counters']['participants'];

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
            ],
            'people' => self::people($from, $to)->all(),
        ];
    }

    /**
     * Raport zamknięcia wskazanej edycji — ta sama koperta co `build()`
     * (kryterium ★2: „raport zamknięcia edycji" jako osobne działanie), ale
     * zawężona do `edition_id` zamiast do zakresu dat: `people()` z filtrem
     * edycji, liczniki `summary` liczone tymi samymi warunkami co pulpit
     * (`User::whereIn('role', [...])->where('status', 'active')`,
     * `whereNotNull('program_completed_at')`), dopisanymi o `edition_id`
     * — `DashboardSummary::build()` nie przyjmuje edycji, więc nie da się
     * go tu wprost wywołać bez zmiany jego zamrożonej sygnatury (H19, poza
     * zakresem). `$from`/`$to` świadomie pominięte: „zamknięcie" to stan na
     * koniec edycji, nie wycinek dziennika.
     *
     * @return array{
     *     summary: array{
     *         admitted: int, active: int, completed: int,
     *         hours_accepted_total: string, hours_accepted_average: string,
     *         consultations_total: int, certificates_issued: int,
     *     },
     *     people: list<array{
     *         id: int, first_name: string, last_name: string, role: string,
     *         hours_accepted: string, consultations: int, certificate_issued: bool,
     *         stage: string, stage_label: string, passed_tests_count: int,
     *     }>,
     * }
     */
    public static function closing(int $editionId): array
    {
        $editionUserIds = User::whereIn('role', ['volunteer', 'student'])
            ->where('edition_id', $editionId)
            ->pluck('id');

        $hoursTotal = (float) self::acceptedEntries(null, null)
            ->whereIn('user_id', $editionUserIds)
            ->sum('hours');
        $consultationsTotal = (int) self::acceptedEntries(null, null)
            ->whereIn('user_id', $editionUserIds)
            ->sum('consultations_count');
        $active = User::whereIn('role', ['volunteer', 'student'])
            ->where('edition_id', $editionId)
            ->where('status', 'active')
            ->count();

        return [
            'summary' => [
                'admitted' => Application::accepted()->forEdition($editionId)->count(),
                'active' => $active,
                'completed' => User::where('edition_id', $editionId)
                    ->whereNotNull('program_completed_at')
                    ->count(),
                'hours_accepted_total' => ProgressAggregator::formatDecimal($hoursTotal),
                'hours_accepted_average' => ProgressAggregator::formatDecimal(
                    $active > 0 ? $hoursTotal / $active : 0.0,
                ),
                'consultations_total' => $consultationsTotal,
                'certificates_issued' => Certificate::where('edition_id', $editionId)->count(),
            ],
            'people' => self::people(null, null, $editionId)->all(),
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
     *     hours_accepted: string, consultations: int, certificate_issued: bool,
     *     stage: string, stage_label: string, passed_tests_count: int,
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
                    'passed_tests_count' => ProgressAggregator::passedTestsCount($user),
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
