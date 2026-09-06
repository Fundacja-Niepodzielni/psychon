<?php

namespace Tests\Feature\H07;

use App\Models\User;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReliabilitySeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_filip_and_marta_match_the_canonical_reliability_demo(): void
    {
        $this->seed();

        $admin = User::where('email', 'admin@demo.pl')->firstOrFail();
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/reliability?per_page=50');

        $response->assertOk()
            ->assertJsonPath('data.0.id', $filip->id)
            ->assertJsonPath('data.0.below_threshold', true);

        $rows = collect($response->json('data'));
        $filipRow = $rows->firstWhere('id', $filip->id);
        $martaRow = $rows->firstWhere('id', $marta->id);

        $this->assertEqualsWithDelta(15, (int) $filipRow['reliability_percent'], 1);
        $this->assertEqualsWithDelta(85, (int) $martaRow['reliability_percent'], 1);
        $this->assertFalse($martaRow['below_threshold']);
        $this->assertSame(
            ProgressAggregator::for($filip)['reliability_percent'],
            (int) $filipRow['reliability_percent'],
        );
        $this->assertSame(
            ProgressAggregator::for($marta)['reliability_percent'],
            (int) $martaRow['reliability_percent'],
        );
    }
}
