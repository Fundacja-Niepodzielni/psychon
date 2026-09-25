<?php

namespace Tests\Unit\Services\H12;

use App\Exceptions\ApiException;
use App\Models\SupervisorAssignment;
use App\Models\User;
use App\Services\H12\SupervisorAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Proba na poziomie uslugi (nie HTTP) dla straznika `requireNoConflict`
 * (powod zwrotu PR #35: przejecie wolontariusza ze skladu innego
 * prowadzacego przez `ThreadMemberController::store`). Druga, niezalezna od
 * `GroupThreadCompositionTest::test_adding_member_with_active_assignment_to_another_instructor_is_refused`,
 * noga odmowna tego samego mechanizmu — jedna mierzy przez trase HTTP,
 * druga wprost na `assign()`.
 */
class SupervisorAssignmentServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_assign_with_require_no_conflict_refuses_volunteer_assigned_elsewhere(): void
    {
        $service = app(SupervisorAssignmentService::class);
        $actor = User::factory()->role('instructor')->create();
        $rightfulOwner = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->role('volunteer')->create();

        SupervisorAssignment::query()->create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $rightfulOwner->id,
            'assigned_at' => now(),
        ]);

        try {
            $service->assign($actor, $volunteer->id, $actor->id, requireNoConflict: true);
            $this->fail('Oczekiwano ApiException 409 — wolontariusz ma aktywne przypisanie do innego prowadzącego.');
        } catch (ApiException $exception) {
            $this->assertSame(409, $exception->status);
        }

        $this->assertSame(
            1,
            SupervisorAssignment::query()
                ->where('supervisor_id', $rightfulOwner->id)
                ->whereNull('unassigned_at')
                ->count(),
            'Skład prawowitego prowadzącego nie może się skurczyć po odmówionej próbie.',
        );
    }

    public function test_assign_without_require_no_conflict_still_reassigns_for_admin_flow(): void
    {
        $actor = User::factory()->role('project_manager')->create();
        $service = app(SupervisorAssignmentService::class);
        $oldSupervisor = User::factory()->role('instructor')->create();
        $newSupervisor = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->role('volunteer')->create();

        SupervisorAssignment::query()->create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $oldSupervisor->id,
            'assigned_at' => now(),
        ]);

        $assignment = $service->assign($actor, $volunteer->id, $newSupervisor->id);

        $this->assertSame($newSupervisor->id, $assignment->supervisor_id);
        $this->assertSame(
            0,
            SupervisorAssignment::query()
                ->where('supervisor_id', $oldSupervisor->id)
                ->whereNull('unassigned_at')
                ->count(),
        );
    }
}
