<?php

namespace App\Services\H19;

use App\Models\Application;
use App\Models\Certificate;
use App\Models\InstructorQuestion;
use App\Models\InternshipEntry;
use App\Models\PsychologistProfile;
use App\Models\User;

/**
 * Pulpit administracji (H19) — liczniki i kolejki spraw.
 *
 * `ProgressAggregator::for()` liczy postęp jednej osoby naraz, więc liczniki
 * wieloosobowe pulpitu liczymy własnymi zapytaniami `COUNT`, zgodnie z
 * kanonicznymi liczbami z `docs/hackathon/04-seed-demo.md` §5 (zweryfikowane
 * też przez `tests/Feature/SeedIntegrityTest::test_dashboard_and_report_counters_match_the_seed`).
 */
final class DashboardSummary
{
    /**
     * @return array{
     *     counters: array{participants: int, completed: int, certificates: int},
     *     queues: list<array{key: string, count: int, link: string}>,
     * }
     */
    public static function build(): array
    {
        return [
            'counters' => [
                'participants' => User::whereIn('role', ['volunteer', 'student'])
                    ->where('status', 'active')
                    ->count(),
                'completed' => User::whereNotNull('program_completed_at')->count(),
                'certificates' => Certificate::count(),
            ],
            'queues' => [
                [
                    'key' => 'applications',
                    'count' => Application::where('status', 'new')->count(),
                    'link' => '/admin/uczestniczki',
                ],
                [
                    'key' => 'internship_entries',
                    'count' => InternshipEntry::where('status', 'submitted')->count(),
                    'link' => '/admin/staz',
                ],
                [
                    'key' => 'profiles',
                    'count' => PsychologistProfile::where('status', 'submitted')->count(),
                    'link' => '/admin/profile',
                ],
                [
                    'key' => 'questions',
                    'count' => InstructorQuestion::whereNull('answer')->count(),
                    'link' => '/panel/prowadzacy',
                ],
            ],
        ];
    }
}
