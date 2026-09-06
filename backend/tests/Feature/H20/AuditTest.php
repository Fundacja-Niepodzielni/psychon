<?php

namespace Tests\Feature\H20;

use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * H20 · GET /admin/audit (+ export.csv) — dziennik działań: filtry po
 * rejestrze §3.2, kryterium ★2 (brak tras modyfikacji → 404), CSV wspólnym
 * helperem.
 */
class AuditTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    public function test_lists_entries_ordered_newest_first(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $first = AuditLog::record($admin, 'user.created', $volunteer, ['role' => 'volunteer']);
        $second = AuditLog::record($admin, 'access.extended', $volunteer, ['months' => 6]);

        $response = $this->getJson('/api/v1/admin/audit');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertSame([$second->id, $first->id], array_slice($ids, 0, 2));
        $this->assertSame($admin->id, $response->json('data.0.actor.id'));
    }

    public function test_filters_by_action_slug_from_the_registry(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        AuditLog::record($admin, 'user.created', $volunteer);
        AuditLog::record($admin, 'access.extended', $volunteer);

        $response = $this->getJson('/api/v1/admin/audit?action=access.extended');

        $response->assertOk();
        $actions = collect($response->json('data'))->pluck('action')->unique()->all();
        $this->assertSame(['access.extended'], $actions);
    }

    public function test_unknown_action_slug_is_rejected(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/v1/admin/audit?action=not.a.real.slug')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_filters_by_actor_user_id(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $otherAdmin = User::factory()->create(['role' => 'project_manager']);
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        AuditLog::record($admin, 'user.created', $volunteer);
        AuditLog::record($otherAdmin, 'access.extended', $volunteer);

        $response = $this->getJson("/api/v1/admin/audit?user_id={$otherAdmin->id}");

        $response->assertOk();
        $actorIds = collect($response->json('data'))->pluck('actor.id')->unique()->all();
        $this->assertSame([$otherAdmin->id], $actorIds);
    }

    public function test_filters_by_date_range(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->travelTo(now()->subDays(10));
        $old = AuditLog::record($admin, 'user.created', $volunteer);
        $this->travelBack();

        $recent = AuditLog::record($admin, 'access.extended', $volunteer);

        $response = $this->getJson('/api/v1/admin/audit?from='.now()->subDay()->toDateString());

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($recent->id, $ids);
        $this->assertNotContains($old->id, $ids);
    }

    /**
     * Kryterium ★2: żadna trasa modyfikacji `/admin/audit/*` nie istnieje —
     * jakakolwiek metoda pod adresem z id zwraca 404, nie 405 (bo dla samego
     * `/admin/audit` GET jest zarejestrowany — testujemy wyłącznie podścieżki).
     */
    public function test_no_audit_mutation_routes_exist(): void
    {
        $this->actingAsRole('super_admin');

        foreach ([
            ['POST', '/api/v1/admin/audit/1'],
            ['PATCH', '/api/v1/admin/audit/1'],
            ['PUT', '/api/v1/admin/audit/1'],
            ['DELETE', '/api/v1/admin/audit/1'],
        ] as [$method, $uri]) {
            $this->json($method, $uri)
                ->assertStatus(404)
                ->assertJsonPath('error.code', 'not_found');
        }
    }

    public function test_non_admin_roles_are_forbidden(): void
    {
        foreach (['volunteer', 'student', 'instructor'] as $role) {
            $this->actingAsRole($role);

            $this->getJson('/api/v1/admin/audit')
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
        }
    }

    public function test_audit_requires_authentication(): void
    {
        $this->getJson('/api/v1/admin/audit')->assertStatus(401);
    }

    public function test_export_csv_uses_the_shared_csv_helper(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        AuditLog::record($admin, 'user.created', $volunteer, ['role' => 'volunteer']);

        $response = $this->get('/api/v1/admin/audit/export.csv');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=utf-8');

        $body = $response->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $body);
        $this->assertStringContainsString('id;action;actor_id', $body);
        $this->assertStringContainsString('user.created', $body);
    }
}
