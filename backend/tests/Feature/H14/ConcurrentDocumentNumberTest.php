<?php

namespace Tests\Feature\H14;

use App\Models\AuditLogEntry;
use App\Models\Document;
use App\Models\Edition;
use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Process\Pool;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Deliberately does NOT use RefreshDatabase: that trait wraps the test in
 * an open transaction, which the spawned OS processes below (separate DB
 * connections) would never see as committed. Real concurrency needs real
 * commits, so setUp/tearDown manage — and clean up — plain committed rows.
 *
 * Run in isolation with: php artisan test --filter=ConcurrentDocumentNumber
 */
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
        $userIds = collect($this->users)->pluck('id');

        Document::whereIn('user_id', $userIds)->delete();
        Notification::whereIn('user_id', $userIds)->delete();
        EmailMessage::whereIn('to_user_id', $userIds)->delete();
        AuditLogEntry::whereIn('actor_id', $userIds)->delete();
        User::whereIn('id', $userIds)->forceDelete();
        Edition::whereKey($this->edition->id)->delete();

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
