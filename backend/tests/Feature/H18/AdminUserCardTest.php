<?php

namespace Tests\Feature\H18;

use App\Models\User;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H18 · GET /admin/users/{id} — karta osoby.
 * Kryterium 3★ (karta `marta@demo.pl` = liczby z `04-seed-demo.md`,
 * wspólny `ProgressAggregator`).
 */
class AdminUserCardTest extends TestCase
{
    use RefreshDatabase;

    public function test_marta_card_matches_the_seed_demo_numbers(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $this->getJson("/api/v1/admin/users/{$marta->id}")
            ->assertOk()
            ->assertJsonPath('data.progress.courses_done', 1)
            ->assertJsonPath('data.progress.courses_total', 10)
            ->assertJsonPath('data.progress.hours_accepted', '41.5')
            ->assertJsonPath('data.progress.supervision_present', 5)
            ->assertJsonPath('data.progress.workshop_done', false);
    }

    public function test_card_progress_is_the_same_source_as_the_aggregator(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $aggregate = ProgressAggregator::for($marta);

        $card = $this->getJson("/api/v1/admin/users/{$marta->id}")->assertOk()->json('data.progress');

        $this->assertSame([
            'courses_done' => $aggregate['courses_done'],
            'courses_total' => $aggregate['courses_total'],
            'hours_accepted' => $aggregate['hours_accepted'],
            'supervision_present' => $aggregate['supervision_present'],
            'workshop_done' => $aggregate['workshop_done'],
        ], $card);
    }

    public function test_card_has_all_five_blocks_and_full_pesel_for_administration(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $response = $this->getJson("/api/v1/admin/users/{$marta->id}")
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'profile' => ['id', 'first_name', 'last_name', 'email', 'role', 'pesel', 'address'],
                    'progress' => ['courses_done', 'courses_total', 'hours_accepted', 'supervision_present', 'workshop_done'],
                    'documents',
                    'recent_notifications',
                    'audit_entries',
                ],
            ]);

        $this->assertSame($marta->pesel, $response->json('data.profile.pesel'));
        $this->assertNotEmpty($response->json('data.profile.pesel'));
    }

    public function test_card_lists_documents_and_recent_notifications(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $data = $this->getJson("/api/v1/admin/users/{$marta->id}")->assertOk()->json('data');

        $this->assertContains('volunteer_agreement', collect($data['documents'])->pluck('type')->all());
        $this->assertContains('internship.returned', collect($data['recent_notifications'])->pluck('type')->all());
    }

    public function test_unknown_id_returns_404(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $this->getJson('/api/v1/admin/users/999999')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_volunteer_cannot_open_a_card(): void
    {
        $this->seed();
        Sanctum::actingAs(User::factory()->role('volunteer')->create());

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $this->getJson("/api/v1/admin/users/{$marta->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }
}
