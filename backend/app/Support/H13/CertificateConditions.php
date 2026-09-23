<?php

namespace App\Support\H13;

use App\Models\User;
use App\Support\ProgressAggregator;
use App\Support\Settings;

/**
 * Pakiet H13 · stan czterech warunków ukończenia programu.
 *
 * Jedno źródło prawdy dla ekranu warunków (`GET /certificate/conditions`) i dla
 * bramki wydania (`POST /certificate/generate`). Liczby pochodzą wyłącznie z
 * `ProgressAggregator::for()` (to samo źródło co karta osoby, pulpit i raport),
 * progi z aktywnej edycji. Nie jest to fasada startera — kod należy do pakietu.
 */
final class CertificateConditions
{
    /** @var array<int, array<string, mixed>> */
    private array $conditions;

    /**
     * Liczba zaliczonych testów osobno od `courses` (poz. 19 Załącznika 1) —
     * pole dodatkowe, nie wchodzi w logikę warunku `courses`/`eligible()`.
     */
    private int $passedTestsCount;

    private function __construct(User $user)
    {
        $progress = ProgressAggregator::for($user);
        $this->passedTestsCount = ProgressAggregator::passedTestsCount($user);

        $hoursRequired = (int) Settings::edition('internship_hours_required');
        $supervisionRequired = (int) Settings::edition('supervision_required_count');

        $coursesMet = $progress['courses_total'] > 0
            && $progress['courses_done'] >= $progress['courses_total'];

        $internshipMet = (float) $progress['hours_accepted'] >= (float) $hoursRequired;

        $supervisionMet = $progress['supervision_present'] >= $supervisionRequired;

        $this->conditions = [
            [
                'key' => 'courses',
                'label' => 'Wszystkie etapy i testy',
                'done' => $progress['courses_done'],
                'required' => $progress['courses_total'],
                'met' => $coursesMet,
            ],
            [
                'key' => 'internship',
                'label' => 'Godziny stażu',
                'done' => $progress['hours_accepted'],
                'required' => ProgressAggregator::formatDecimal((float) $hoursRequired),
                'met' => $internshipMet,
            ],
            [
                'key' => 'supervision',
                'label' => 'Obecności na superwizjach',
                'done' => $progress['supervision_present'],
                'required' => $supervisionRequired,
                'met' => $supervisionMet,
            ],
            [
                'key' => 'workshop',
                'label' => 'Warsztat stacjonarny',
                'met' => $progress['workshop_done'],
            ],
        ];
    }

    public static function for(User $user): self
    {
        return new self($user);
    }

    public function eligible(): bool
    {
        foreach ($this->conditions as $condition) {
            if ($condition['met'] === false) {
                return false;
            }
        }

        return true;
    }

    /**
     * Klucze warunków, które nie są spełnione.
     *
     * @return list<string>
     */
    public function missing(): array
    {
        return array_values(array_map(
            static fn (array $c): string => $c['key'],
            array_filter($this->conditions, static fn (array $c): bool => $c['met'] === false),
        ));
    }

    /**
     * Kształt kontraktu: `{ eligible, conditions: [ { key, label, done?, required?, met } ], passed_tests_count }`.
     * Warunek `workshop` nie ma liczników. `passed_tests_count` jest polem
     * dodatkowym (wstecznie kompatybilnym) — poz. 19 Załącznika 1, liczba
     * różnych testów z co najmniej jedną zaliczoną próbą.
     *
     * @return array{eligible: bool, conditions: array<int, array<string, mixed>>, passed_tests_count: int}
     */
    public function toArray(): array
    {
        return [
            'eligible' => $this->eligible(),
            'conditions' => $this->conditions,
            'passed_tests_count' => $this->passedTestsCount,
        ];
    }
}
