<?php

namespace Tests\Feature\H19;

use App\Models\Application;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\Edition;
use App\Models\InstructorQuestion;
use App\Models\InternshipEntry;
use App\Models\Lesson;
use App\Models\PsychologistProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * GET /admin/dashboard — każdy licznik pulpitu zwraca dokładnie liczbę
 * zasianą w teście, niezależnie od seedera demo.
 *
 * Liczby są parami różne (5, 2, 3, 4, 6, 1, 7), więc zamiana dwóch kluczy
 * w `DashboardSummary` też daje czerwień. Obok każdego licznika leżą wiersze,
 * których licznik liczyć nie może (inna rola, konto zablokowane, inny status,
 * wpis usunięty miękko) — ich doliczenie zmienia wynik o co najmniej jeden.
 */
class DashboardCountersSeededStateTest extends TestCase
{
    use RefreshDatabase;

    private const PARTICIPANTS = 5;

    private const COMPLETED = 2;

    private const CERTIFICATES = 3;

    private const APPLICATIONS = 4;

    private const INTERNSHIP_ENTRIES = 6;

    private const PROFILES = 1;

    private const QUESTIONS = 7;

    private Edition $edition;

    private Lesson $lesson;

    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->edition = Edition::factory()->create();

        $course = Course::create([
            'title' => 'Kurs licznikow',
            'slug' => 'kurs-licznikow-'.Str::lower(Str::random(8)),
            'sequence_order' => 1,
            'is_published' => true,
        ]);

        $this->lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja licznikow',
            'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);

        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');
    }

    public function test_every_counter_returns_exactly_the_seeded_number(): void
    {
        $this->seedCountedRows();
        $this->seedRowsNoCounterMayCount();

        $this->assertDashboard([
            'participants' => self::PARTICIPANTS,
            'completed' => self::COMPLETED,
            'certificates' => self::CERTIFICATES,
            'applications' => self::APPLICATIONS,
            'internship_entries' => self::INTERNSHIP_ENTRIES,
            'profiles' => self::PROFILES,
            'questions' => self::QUESTIONS,
        ]);
    }

    /**
     * Kontrola negatywna w tej samej próbie: jeden wiersz więcej w każdej
     * liczonej kategorii przesuwa każdy licznik dokładnie o jeden, więc
     * oczekiwanie z pierwszej próby musi tu oblać.
     */
    public function test_one_more_seeded_row_moves_every_counter_by_exactly_one(): void
    {
        $this->seedCountedRows();
        $this->seedRowsNoCounterMayCount();

        $extra = $this->participant('volunteer', completed: true);
        $this->certificateFor($extra);
        Application::factory()->create();
        $this->internshipEntry($extra, 'submitted');
        $this->profile($extra, 'submitted');
        $this->question($extra, answered: false);

        $expected = [
            'participants' => self::PARTICIPANTS + 1,
            'completed' => self::COMPLETED + 1,
            'certificates' => self::CERTIFICATES + 1,
            'applications' => self::APPLICATIONS + 1,
            'internship_entries' => self::INTERNSHIP_ENTRIES + 1,
            'profiles' => self::PROFILES + 1,
            'questions' => self::QUESTIONS + 1,
        ];

        $measured = $this->assertDashboard($expected);

        foreach ($expected as $key => $value) {
            $this->assertNotSame($value - 1, $measured[$key], "Licznik {$key} nie zareagował na dodatkowy wiersz.");
        }
    }

    /**
     * @param  array<string, int>  $expected
     * @return array<string, int>
     */
    private function assertDashboard(array $expected): array
    {
        $response = $this->getJson('/api/v1/admin/dashboard')->assertOk();

        $queues = collect($response->json('data.queues'))->pluck('count', 'key')->all();
        $measured = [
            'participants' => $response->json('data.counters.participants'),
            'completed' => $response->json('data.counters.completed'),
            'certificates' => $response->json('data.counters.certificates'),
            'applications' => $queues['applications'] ?? null,
            'internship_entries' => $queues['internship_entries'] ?? null,
            'profiles' => $queues['profiles'] ?? null,
            'questions' => $queues['questions'] ?? null,
        ];

        foreach ($expected as $key => $value) {
            $this->assertSame($value, $measured[$key], "Licznik {$key}: oczekiwano {$value}.");
        }

        return $measured;
    }

    private function seedCountedRows(): void
    {
        $volunteers = [];
        for ($i = 0; $i < 3; $i++) {
            $volunteers[] = $this->participant('volunteer', completed: $i < self::COMPLETED);
        }
        $students = [
            $this->participant('student'),
            $this->participant('student'),
        ];
        $people = [...$volunteers, ...$students];

        foreach (array_slice($people, 0, self::CERTIFICATES) as $person) {
            $this->certificateFor($person);
        }

        Application::factory()->count(self::APPLICATIONS)->create();

        for ($i = 0; $i < self::INTERNSHIP_ENTRIES; $i++) {
            $this->internshipEntry($people[$i % count($people)], 'submitted');
        }

        $this->profile($people[0], 'submitted');

        for ($i = 0; $i < self::QUESTIONS; $i++) {
            $this->question($people[$i % count($people)], answered: false);
        }
    }

    /**
     * Wiersze, których żaden licznik pulpitu nie może policzyć.
     */
    private function seedRowsNoCounterMayCount(): void
    {
        $blocked = User::factory()->create(['role' => 'volunteer', 'status' => 'blocked']);
        $instructor = User::factory()->role('instructor')->create();
        User::factory()->role('project_manager')->create();

        Application::factory()->accepted()->create();
        Application::factory()->rejected()->create();

        $this->internshipEntry($blocked, 'accepted');
        $this->internshipEntry($blocked, 'returned');
        $this->internshipEntry($blocked, 'submitted')->delete();

        $this->profile($blocked, 'draft');
        $this->profile($instructor, 'accepted');

        $this->question($blocked, answered: true);
    }

    private function participant(string $role, bool $completed = false): User
    {
        return User::factory()->role($role)->create([
            'program_completed_at' => $completed ? now() : null,
        ]);
    }

    private function certificateFor(User $person): void
    {
        $this->sequence++;

        Certificate::create([
            'user_id' => $person->id,
            'edition_id' => $this->edition->id,
            'number' => sprintf('NP/2026/L%03d', $this->sequence),
            'issued_at' => now(),
            'verification_token' => Str::random(40),
        ]);
    }

    private function internshipEntry(User $person, string $status): InternshipEntry
    {
        return InternshipEntry::create([
            'user_id' => $person->id,
            'date' => '2026-08-20',
            'hours' => '1.5',
            'form' => 'phone_duty',
            'consultations_count' => 1,
            'description' => 'Wpis licznika pulpitu.',
            'status' => $status,
        ]);
    }

    private function profile(User $person, string $status): void
    {
        PsychologistProfile::create([
            'user_id' => $person->id,
            'status' => $status,
        ]);
    }

    private function question(User $asker, bool $answered): void
    {
        InstructorQuestion::create([
            'user_id' => $asker->id,
            'lesson_id' => $this->lesson->id,
            'question' => 'Pytanie licznika pulpitu.',
            'answer' => $answered ? 'Odpowiedź.' : null,
            'answered_at' => $answered ? now() : null,
        ]);
    }
}
