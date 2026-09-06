<?php

namespace Tests\Feature\AccessExpiry;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * H04 · `php artisan access:check-expired` — zadanie cykliczne (scheduled
 * daily via routes/console.php). Nie blokuje niczego samo w sobie (to robi
 * `EnsureAccessActive` na żywo) — tylko loguje widoczność operacyjną.
 */
class CheckExpiredAccessCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_logs_users_with_expired_access_and_no_completed_programme(): void
    {
        $expired = User::factory()->create([
            'role' => 'volunteer',
            'access_expires_at' => now()->subDay(),
            'program_completed_at' => null,
        ]);
        User::factory()->create([ // aktywny — nie powinien się liczyć
            'role' => 'volunteer',
            'access_expires_at' => now()->addMonth(),
        ]);
        User::factory()->create([ // wygasły, ale program ukończony — nie powinien się liczyć
            'role' => 'volunteer',
            'access_expires_at' => now()->subDay(),
            'program_completed_at' => now()->subDay(),
        ]);
        User::factory()->create([ // bezterminowo — nie powinien się liczyć
            'role' => 'volunteer',
            'access_expires_at' => null,
        ]);

        Log::spy();

        $this->artisan('access:check-expired')->assertSuccessful();

        Log::shouldHaveReceived('info')
            ->once()
            ->withArgs(function (string $message, array $context) use ($expired): bool {
                return $message === 'access:check-expired — konta z wygasłym dostępem'
                    && $context['count'] === 1
                    && $context['user_ids'] === [$expired->id];
            });
    }

    public function test_does_not_log_when_nothing_is_expired(): void
    {
        User::factory()->create(['access_expires_at' => now()->addMonth()]);

        Log::spy();

        $this->artisan('access:check-expired')->assertSuccessful();

        Log::shouldNotHaveReceived('info');
    }
}
