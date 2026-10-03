<?php

namespace Tests\Feature\H03;

use App\Models\Application;
use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\User;
use App\Services\H18\AccountManagementGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * H03 · przyjęcie zgłoszenia zakłada konto, więc rolę administracyjną nadaje
 * wyłącznie Super Admin — ta sama odmowa (status, `code`, `message`, treść
 * odpowiedzi bajt w bajt) co założenie konta w panelu osób (H18). Dostęp jest
 * rozstrzygnięty przed walidacją ciała. Prawdziwe tokeny realmu.
 */
class AcceptApplicationAdministrationRoleTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    private Edition $edition;

    protected function setUp(): void
    {
        parent::setUp();
        $this->edition = Edition::factory()->create(['status' => 'active']);
    }

    private function application(): Application
    {
        return Application::factory()->create(['edition_id' => $this->edition->id]);
    }

    public function test_project_manager_gets_the_same_refusal_as_in_the_account_panel(): void
    {
        $pm = $this->boundAccount('project_manager');

        foreach (['project_manager', 'super_admin'] as $role) {
            $application = $this->application();

            $panel = $this->withTokenOf($pm)->postJson('/api/v1/admin/users', [
                'first_name' => 'Celina',
                'last_name' => 'Demo',
                'email' => "panel.{$role}@example.test",
                'role' => $role,
            ]);
            $panel->assertStatus(403)->assertJsonPath('error.code', 'forbidden');

            $accept = $this->withTokenOf($pm)->postJson("/api/v1/admin/applications/{$application->id}/accept", ['role' => $role]);

            $this->assertSame($panel->getStatusCode(), $accept->getStatusCode());
            $this->assertSame($panel->getContent(), $accept->getContent());

            $this->assertSame('new', $application->fresh()->status);
            $this->assertNull($application->fresh()->user_id);
        }

        $this->assertSame(0, User::query()->where('email', 'like', 'candidate+%')->count());
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'application.accepted')->count());
    }

    public function test_the_refusal_comes_before_the_body_is_validated(): void
    {
        $pm = $this->boundAccount('project_manager');
        $application = $this->application();

        // Sama rola administracyjna z ciałem, które nie przeszłoby walidacji dalej.
        $this->withTokenOf($pm)->postJson("/api/v1/admin/applications/{$application->id}/accept", ['role' => 'project_manager', 'force' => 'nie-wiem'])
            ->assertStatus(403)
            ->assertJsonPath('error.message', AccountManagementGuard::ADMIN_ROLES_MESSAGE);

        // Nieistniejące zgłoszenie z rolą administracyjną: ta sama odmowa, nie 404.
        $this->withTokenOf($pm)->postJson('/api/v1/admin/applications/'.($application->id + 1000).'/accept', ['role' => 'project_manager'])
            ->assertStatus(403)
            ->assertJsonPath('error.message', AccountManagementGuard::ADMIN_ROLES_MESSAGE);

        $this->assertSame('new', $application->fresh()->status);
    }

    public function test_project_manager_still_accepts_non_administration_roles(): void
    {
        $pm = $this->boundAccount('project_manager');

        foreach (['instructor', 'volunteer', 'student'] as $role) {
            $application = $this->application();

            $userId = $this->withTokenOf($pm)->postJson("/api/v1/admin/applications/{$application->id}/accept", ['role' => $role])
                ->assertCreated()
                ->json('data.user_id');

            $this->assertSame($role, User::query()->findOrFail($userId)->role);
        }
    }

    public function test_super_admin_accepts_with_administration_roles(): void
    {
        $sa = $this->boundAccount('super_admin');

        foreach (['project_manager', 'super_admin'] as $role) {
            $application = $this->application();

            $userId = $this->withTokenOf($sa)->postJson("/api/v1/admin/applications/{$application->id}/accept", ['role' => $role])
                ->assertCreated()
                ->json('data.user_id');

            $this->assertSame($role, User::query()->findOrFail($userId)->role);
            $this->assertSame('accepted', $application->fresh()->status);
        }
    }
}
