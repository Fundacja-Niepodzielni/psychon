<?php

namespace Tests\Feature\H20;

use App\Http\Requests\H20\AuditIndexRequest;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Rejestr zdarzeń zna zakończenie przypisania opiekuna: dziennik daje się
 * po nim filtrować tak samo jak po rozpoczęciu przypisania.
 */
class SupervisorUnassignedAuditFilterTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    public function test_registry_lists_the_end_of_a_supervisor_assignment(): void
    {
        $this->assertContains('supervisor.unassigned', AuditIndexRequest::ACTIONS);
        $this->assertContains('supervisor.assigned', AuditIndexRequest::ACTIONS);
    }

    public function test_audit_log_filters_by_the_end_of_a_supervisor_assignment(): void
    {
        $admin = $this->actingAsRole('project_manager');
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        AuditLog::record($admin, 'supervisor.assigned', $volunteer);
        $ended = AuditLog::record($admin, 'supervisor.unassigned', $volunteer);

        $response = $this->getJson('/api/v1/admin/audit?action=supervisor.unassigned');

        $response->assertOk();
        $this->assertSame([$ended->id], collect($response->json('data'))->pluck('id')->all());
        $this->assertSame(['supervisor.unassigned'], collect($response->json('data'))->pluck('action')->unique()->values()->all());
    }
}
