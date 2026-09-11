<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
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
        $this->actingAs(User::where('email', 'admin@demo.pl')->firstOrFail(), 'keycloak');

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
        $this->actingAs(User::where('email', 'admin@demo.pl')->firstOrFail(), 'keycloak');

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $this->postJson("/api/v1/admin/users/{$marta->id}/block", [])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame('active', $marta->fresh()->status);
    }

    public function test_project_manager_cannot_block_a_super_admin(): void
    {
        $this->seed();
        $this->actingAs(User::where('email', 'opiekun@demo.pl')->firstOrFail(), 'keycloak');

        $admin = User::where('email', 'admin@demo.pl')->firstOrFail();

        $this->postJson("/api/v1/admin/users/{$admin->id}/block", ['reason' => 'test'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertSame('active', $admin->fresh()->status);
    }

    /**
     * SSO only: there is no password login left to carry a "blocked" vs
     * "access expired" message — the guarantee moves to the `keycloak`
     * guard itself. A BLOCKED account's bearer token never resolves a user
     * at all (401 `unauthenticated`, indistinguishable from "no such
     * account" — the guard never explains itself), while an account with
     * merely EXPIRED access resolves fine and is refused later, by
     * `access.active`, with the distinct `access_expired` reason (kryterium 4).
     */
    public function test_blocked_gets_401_from_the_guard_expired_access_gets_403_later(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();

        $blockedSub = (string) Str::uuid();
        User::factory()->role('volunteer')->create([
            'email' => 'blocked@demo.pl',
            'status' => 'blocked',
            'keycloak_sub' => $blockedSub,
        ]);
        $blockedToken = $realm->mint(['sub' => $blockedSub]);

        $expiredSub = (string) Str::uuid();
        User::factory()->role('volunteer')->create([
            'email' => 'expired@demo.pl',
            'status' => 'active',
            'program_completed_at' => null,
            'access_expires_at' => now()->subDay(),
            'keycloak_sub' => $expiredSub,
        ]);
        $expiredToken = $realm->mint(['sub' => $expiredSub]);

        // Blocked — the guard itself refuses, before any role/access check runs.
        $blockedResponse = $this->withHeader('Authorization', 'Bearer '.$blockedToken)
            ->getJson('/api/v1/me')
            ->assertStatus(401);

        $this->assertSame('unauthenticated', $blockedResponse->json('error.code'));

        // Expired access — the guard resolves the user fine; `/me` itself is
        // exempt (kryterium 4), but programme content is not.
        $this->withHeader('Authorization', 'Bearer '.$expiredToken)
            ->getJson('/api/v1/me')
            ->assertOk();

        $expiredResponse = $this->withHeader('Authorization', 'Bearer '.$expiredToken)
            ->getJson('/api/v1/internship/entries')
            ->assertStatus(403);

        $this->assertSame('access_expired', $expiredResponse->json('error.code'));
    }
}
