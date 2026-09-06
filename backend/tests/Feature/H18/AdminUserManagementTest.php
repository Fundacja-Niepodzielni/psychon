<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\EmailMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H18 · POST/PATCH /admin/users — konta z zaproszeniem, edycja
 * e-maila z audytem, matryca ról (kryterium 2★).
 */
class AdminUserManagementTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Nowa',
            'last_name' => 'Osoba',
            'email' => 'nowa.osoba@demo.pl',
            'role' => 'volunteer',
        ], $overrides);
    }

    public function test_creates_account_with_activation_token_email_and_audit(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $this->postJson('/api/v1/admin/users', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.profile.email', 'nowa.osoba@demo.pl');

        $user = User::where('email', 'nowa.osoba@demo.pl')->firstOrFail();
        $this->assertNotNull($user->activation_token);
        $this->assertNull($user->password);
        $this->assertSame('active', $user->status);

        $this->assertTrue(
            EmailMessage::where('to_user_id', $user->id)->where('status', 'simulated')->exists()
        );
        $this->assertTrue(
            AuditLogEntry::where('action', 'user.created')
                ->where('subject_id', $user->id)
                ->exists()
        );
    }

    public function test_duplicate_email_returns_409(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $this->postJson('/api/v1/admin/users', $this->payload(['email' => 'marta@demo.pl']))
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'email_already_registered')
            ->assertJsonPath('error.reason.existing_user_id', User::where('email', 'marta@demo.pl')->value('id'));
    }

    public function test_missing_email_returns_422(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $this->postJson('/api/v1/admin/users', $this->payload(['email' => null]))
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['email']]]);
    }

    public function test_email_change_is_audited_as_user_updated(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $this->patchJson("/api/v1/admin/users/{$marta->id}", ['email' => 'marta.nowa@demo.pl'])
            ->assertOk()
            ->assertJsonPath('data.profile.email', 'marta.nowa@demo.pl');

        $entry = AuditLogEntry::where('action', 'user.updated')
            ->where('subject_id', $marta->id)
            ->latest('id')
            ->firstOrFail();

        $this->assertContains('email', $entry->details['changed']);
    }

    public function test_email_conflict_on_update_returns_422_without_change(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $this->patchJson("/api/v1/admin/users/{$marta->id}", ['email' => 'ola@demo.pl'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame('marta@demo.pl', $marta->fresh()->email);
    }

    public function test_unknown_id_on_update_returns_404(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $this->patchJson('/api/v1/admin/users/999999', ['first_name' => 'X'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_project_manager_cannot_assign_super_admin_role(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'opiekun@demo.pl')->firstOrFail());

        $auditBefore = AuditLogEntry::count();

        $this->postJson('/api/v1/admin/users', $this->payload(['role' => 'super_admin']))
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertFalse(User::where('email', 'nowa.osoba@demo.pl')->exists());
        $this->assertSame($auditBefore, AuditLogEntry::count());
    }

    public function test_project_manager_cannot_edit_a_super_admin_account(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'opiekun@demo.pl')->firstOrFail());

        $admin = User::where('email', 'admin@demo.pl')->firstOrFail();

        $this->patchJson("/api/v1/admin/users/{$admin->id}", ['first_name' => 'Zmiana'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertSame('Adam', $admin->fresh()->first_name);
    }

    public function test_super_admin_can_assign_super_admin_role(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $this->patchJson("/api/v1/admin/users/{$marta->id}", ['role' => 'super_admin'])
            ->assertOk();

        $this->assertSame('super_admin', $marta->fresh()->role);
        $this->assertTrue(
            AuditLogEntry::where('action', 'user.updated')->where('subject_id', $marta->id)->exists()
        );
    }
}
