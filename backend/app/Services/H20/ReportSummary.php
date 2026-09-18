<?php

namespace App\Services\H20;

use App\Models\Application;
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
 * Poz. 27 „Rozszerzone raporty" — zakres dat `$from`/`to` zawęża godziny
 * i konsultacje po `internship_entries.date` (kolumna, po której raport już
 * agreguje — patrz sumy niżej). Liczniki pulpitu (`admitted`/`active`/
 * `completed`/`certificates_issued`) NIE są filtrowane — pochodzą ze stanu
 * bieżącego (`DashboardSummary`/`Application::accepted()`), nie z dziennika
 * zdarzeń z własną datą; to alternatywna interpretacja „okresu", tu
 * świadomie pominięta jako wymagająca osobnej zmiany w H19.
 */
final class ReportSummary
{
    /**
     * Poz. 18 „Postępy" — etap ścieżki tej samej osoby, jeden na wiersz
     * (nie mylić z listą etapów-kursów `pathStages` we froncie). Słownik
     * NIE jest nowym wymysłem: to kolejność czterech warunków certyfikatu
     * z `CertificateConditions` (`courses` → `internship` → `supervision`
     * → `workshop`, plik `Support/H13/CertificateConditions.php:36-63`) plus
     * stan „wszystkie warunki spełnione", który front już dziś traktuje jako
     * odrębny krok `kind: 'certificate'`
     * (`frontend/lib/pulpit/data.ts:101-127`, zwłaszcza linie 122-124 —
     * cała ścieżka `completed` → certyfikat, niezależnie od tego, czy sam
     * dokument już wygenerowano). Etap to wartość punktowa (aktualny stan
     * `ProgressAggregator::for()`), NIE zależy od `$from`/`$to` raportu —
     * te dwa parametry zawężają wyłącznie sumy z dziennika stażu
     * (`acceptedEntries()` niżej), a `ProgressAggregator` liczy godziny/
     * obecności bez filtra dat.
     */
    private const STAGE_LABELS = [
        'kurs' => 'Kursy i testy',
        'staz' => 'Staż',
        'superwizja' => 'Superwizje',
        'warsztat' => 'Warsztat stacjonarny',
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
     *         stage: string, stage_label: string,
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
     * Zestawienie imienne — jedno źródło dla ekranu raportu i CSV.
     *
     * @return Collection<int, array{id:int, first_name:string, last_name:string, role:string, hours_accepted:string, consultations:int, certificate_issued:bool, stage:string, stage_label:string}>
     */
    public static function people(?string $from = null, ?string $to = null): Collection
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

        return User::query()
            ->whereIn('role', ['volunteer', 'student'])
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get()
            ->map(function (User $user) use ($from, $to, $certifiedUserIds, $hoursRequired, $supervisionRequired): array {
                $stage = self::stage(ProgressAggregator::for($user), $hoursRequired, $supervisionRequired);

                return [
                    'id' => $user->id,
                    'first_name' => $user->first_name,
                    'last_name' => $user->last_name,
                    'role' => $user->role,
                    'hours_accepted' => ProgressAggregator::formatDecimal(
                        (float) self::acceptedEntries($from, $to, $user->id)->sum('hours'),
                    ),
                    'consultations' => (int) self::acceptedEntries($from, $to, $user->id)->sum('consultations_count'),
                    'certificate_issued' => $certifiedUserIds->has($user->id),
                    'stage' => $stage,
                    'stage_label' => self::STAGE_LABELS[$stage],
                ];
            })
            ->values();
    }

    /**
     * Pierwszy niespełniony warunek z `CertificateConditions` (ten sam
     * porządek: kursy → staż → superwizje → warsztat); gdy wszystkie
     * spełnione — etap „certyfikat" (patrz nota przy `STAGE_LABELS`).
     * Liczby z `ProgressAggregator::for()`, tak jak karta osoby i pulpit
     * — żadna nowa reguła biznesowa.
     *
     * @param  array{courses_done:int, courses_total:int, hours_accepted:string, supervision_present:int, workshop_done:bool, reliability_percent:int|null}  $progress
     */
    private static function stage(array $progress, float $hoursRequired, int $supervisionRequired): string
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

        return 'certyfikat';
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
