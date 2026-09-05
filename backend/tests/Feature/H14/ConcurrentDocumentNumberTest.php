<?php

namespace Tests\Feature\H14;

use App\Models\Edition;
use App\Models\User;
use Illuminate\Process\Pool;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Deliberately does NOT use RefreshDatabase: that trait wraps the test in
 * an open transaction, which the spawned OS processes below (separate DB
 * connections) would never see as committed. Real concurrency needs real
 * commits, so setUp/tearDown manage — and clean up — plain committed rows.
 *
 * Run in isolation with: php artisan test --filter=ConcurrentDocumentNumber
 *
 * GRUPA `wspolna-baza` — ta klasa NIE JEST zrównoleglana i to jest jej cecha, nie brak.
 * Nie ma `RefreshDatabase` (patrz wyżej), więc runner równoległy nie przełącza jej na
 * własną bazę procesu (`TestDatabases.php:56` — przełączenie dotyczy wyłącznie klas
 * z cechą bazodanową). Zostaje na bazie wspólnej razem z drugą taką klasą i obie ścigają
 * się o te same wiersze: zmierzone pod `--parallel` jako zakleszczenie i kolizja
 * na numeracji dokumentów. Puszczona pod runnerem ta klasa mierzy
 * WTEDY runnera, a nie niezmiennik, o który została napisana.
 * Dlatego bramka ma dwa kroki: `--parallel --exclude-group=wspolna-baza`, a potem
 * `--group=wspolna-baza` sekwencyjnie.
 */
#[Group('wspolna-baza')]
class ConcurrentDocumentNumberTest extends TestCase
{
    private Edition $edition;

    /** @var list<User> */
    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (! Schema::hasTable('documents')) {
            $this->artisan('migrate');
        }

        $this->edition = Edition::create([
            'name' => 'Edycja współbieżności',
            'starts_at' => '2026-10-01',
            'ends_at' => '2027-09-30',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);

        for ($i = 0; $i < 10; $i++) {
            $this->users[] = User::factory()->create([
                'edition_id' => $this->edition->id,
                'first_name' => 'Test',
                'last_name' => "Concurrent{$i}",
                'phone' => '+48 600 000 000',
                'pesel' => '90010112345',
                'address_street' => 'ul. Testowa 1',
                'address_city' => 'Warszawa',
                'address_zip' => '00-001',
            ]);
        }
    }

    protected function tearDown(): void
    {
        // Przywrócenie stanu zastanego zamiast ręcznej listy tabel — patrz
        // `TestCase::przywrocStanZastanejBazy()`. Strażnik w `TestCase::tearDown()`
        // sprawdza po nas, czy naprawdę nic nie zostało.
        $this->przywrocStanZastanejBazy();

        parent::tearDown();
    }

    public function test_ten_concurrent_generations_produce_a_gapless_unique_sequence(): void
    {
        $results = Process::pool(function (Pool $pool): void {
            foreach ($this->users as $user) {
                $pool->path(base_path())
                    ->command([PHP_BINARY, 'artisan', 'documents:issue', (string) $user->id, 'volunteer_agreement']);
            }
        })->wait();

        $this->assertTrue(
            $results->successful(),
            'Co najmniej jeden proces zakończył się błędem: '
                .$results->collect()->map(fn ($r) => trim($r->errorOutput()))->implode(' | '),
        );

        $numbers = $results->collect()
            ->map(fn ($result) => trim($result->output()))
            ->values();

        $this->assertCount(10, $numbers);
        $this->assertCount(10, $numbers->unique(), 'Numery dokumentów zduplikowane pod obciążeniem.');

        $sequences = $numbers
            ->map(fn (string $number): int => (int) substr($number, strrpos($number, '/') + 1))
            ->sort()
            ->values()
            ->all();

        $this->assertSame(range(1, 10), $sequences, 'Ciąg numeracji ma dziury.');
    }
}
