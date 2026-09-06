<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H18 · POST /admin/users/{id}/block — blokada z powodem oraz
 * rozróżnienie komunikatu logowania od „dostęp wygasł" (kryterium 4).
 */
class AdminUserBlockTest extends TestCase
{
    use RefreshDatabase;

    public function test_blocks_account_with_reason_and_audit(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $this->postJson("/api/v1/admin/users/{$marta->id}/block", ['reason' => 'Naruszenie regulaminu.'])
            ->assertOk()
            ->assertJsonPath('data.profile.email', 'marta@demo.pl');

        $this->assertSame('blocked', $marta->fresh()->status);

        $entry = AuditLogEntry::where('action', 'user.blocked')
            ->where('subject_id', $marta->id)
            ->firstOrFail();
        $this->assertSame('Naruszenie regulaminu.', $entry->details['reason']);
    }

    public function test_missing_reason_returns_422(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $this->postJson("/api/v1/admin/users/{$marta->id}/block", [])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame('active', $marta->fresh()->status);
    }

    public function test_project_manager_cannot_block_a_super_admin(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'opiekun@demo.pl')->firstOrFail());

        $admin = User::where('email', 'admin@demo.pl')->firstOrFail();

        $this->postJson("/api/v1/admin/users/{$admin->id}/block", ['reason' => 'test'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertSame('active', $admin->fresh()->status);
    }

    public function test_blocked_login_message_differs_from_access_expired(): void
    {
        $this->seed();

        $blocked = User::factory()->role('volunteer')->create([
            'email' => 'blocked@demo.pl',
            'password' => bcrypt('password'),
            'status' => 'blocked',
        ]);

        $expired = User::factory()->role('volunteer')->create([
            'email' => 'expired@demo.pl',
            'password' => bcrypt('password'),
            'status' => 'active',
            'program_completed_at' => null,
            'access_expires_at' => now()->subDay(),
        ]);

        // Zablokowane konto — logowanie odrzucone z komunikatem o blokadzie.
        $blockedResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'blocked@demo.pl',
            'password' => 'password',
        ])->assertStatus(403);

        $this->assertSame('forbidden', $blockedResponse->json('error.code'));
        $this->assertStringContainsStringIgnoringCase('zablokowane', $blockedResponse->json('error.message'));
        $this->assertStringNotContainsStringIgnoringCase('wygas', $blockedResponse->json('error.message'));

        // Konto z wygasłym dostępem — logowanie przechodzi (blokada treści jest później).
        $expiredResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'expired@demo.pl',
            'password' => 'password',
        ])->assertOk();

        $this->assertNotNull($expiredResponse->json('data.token'));
        unset($blocked, $expired);
    }
}
