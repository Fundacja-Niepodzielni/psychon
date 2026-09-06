<?php

namespace Tests\Feature\H03;

use App\Models\Application;
use App\Models\Edition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApplicationModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_factory_creates_a_fictional_application_for_an_edition(): void
    {
        $application = Application::factory()->create();

        $this->assertInstanceOf(Edition::class, $application->edition);
        $this->assertSame('new', $application->status);
        $this->assertStringEndsWith('@example.test', $application->email);
    }

    public function test_factory_states_cover_the_application_workflow(): void
    {
        $accepted = Application::factory()->accepted()->create();
        $rejected = Application::factory()->rejected('Brak wymaganego dokumentu.')->create();

        $this->assertSame('accepted', $accepted->status);
        $this->assertSame('rejected', $rejected->status);
        $this->assertSame('Brak wymaganego dokumentu.', $rejected->rejection_reason);
    }

    public function test_relations_and_state_scopes_are_available(): void
    {
        $edition = Edition::factory()->create();
        $decider = User::factory()->role('project_manager')->create();
        $candidate = User::factory()->create();
        $application = Application::factory()->create([
            'edition_id' => $edition->id,
            'decided_by' => $decider->id,
            'user_id' => $candidate->id,
        ]);
        Application::factory()->accepted()->create(['edition_id' => $edition->id]);

        $this->assertTrue($application->edition->is($edition));
        $this->assertTrue($application->decidedBy->is($decider));
        $this->assertTrue($application->user->is($candidate));
        $this->assertSame(2, Application::query()->forEdition($edition)->count());
        $this->assertSame(1, $edition->applications()->new()->count());
        $this->assertSame(1, $edition->acceptedApplications()->count());
    }
}
