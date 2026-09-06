<?php

namespace Tests\Feature\H19;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H19 · GET /admin/dashboard — kryterium 1★.
 */
class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_counters_and_queues_match_the_seed_demo(): void
    {
        $this->seed();

        $admin = User::where('email', 'admin@demo.pl')->firstOrFail();
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.counters.participants', 3)
            ->assertJsonPath('data.counters.completed', 1)
            ->assertJsonPath('data.counters.certificates', 1)
            ->assertJsonStructure([
                'data' => [
                    'counters' => ['participants', 'completed', 'certificates'],
                    'queues' => [['key', 'count', 'link']],
                ],
            ]);

        $queues = collect($response->json('data.queues'))->keyBy('key');

        $this->assertSame(1, $queues['applications']['count']);
        $this->assertSame(2, $queues['internship_entries']['count']);
        $this->assertSame(0, $queues['profiles']['count']);
        $this->assertSame(1, $queues['questions']['count']);

        foreach ($queues as $queue) {
            $this->assertNotEmpty($queue['link']);
        }
    }

    public function test_project_manager_can_also_see_the_dashboard(): void
    {
        $this->seed();

        $opiekun = User::where('email', 'opiekun@demo.pl')->firstOrFail();
        Sanctum::actingAs($opiekun);

        $this->getJson('/api/v1/admin/dashboard')->assertOk();
    }

    public function test_volunteer_is_forbidden(): void
    {
        $volunteer = User::factory()->role('volunteer')->create();
        Sanctum::actingAs($volunteer);

        $this->getJson('/api/v1/admin/dashboard')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_guest_is_unauthenticated(): void
    {
        $this->getJson('/api/v1/admin/dashboard')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }
}
