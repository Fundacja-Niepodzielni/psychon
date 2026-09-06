<?php

namespace Tests\Feature\H18;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H18 · GET /admin/users — lista, filtry, wyszukiwanie, paginacja.
 * Kryterium 1★ (filtr `role` + szukajka na seedach).
 */
class AdminUserListTest extends TestCase
{
    use RefreshDatabase;

    public function test_role_filter_and_search_narrow_the_list(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $response = $this->getJson('/api/v1/admin/users?role=volunteer&search=demo')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'first_name', 'last_name', 'email', 'role', 'status', 'product_group', 'access_expires_at', 'program_completed_at', 'created_at']],
                'meta' => ['current_page', 'per_page', 'total', 'last_page'],
            ]);

        $roles = collect($response->json('data'))->pluck('role')->unique()->values()->all();
        $this->assertSame(['volunteer'], $roles);

        $emails = collect($response->json('data'))->pluck('email');
        $this->assertTrue($emails->contains('marta@demo.pl'));
        $this->assertTrue($emails->contains('ola@demo.pl'));
        $this->assertFalse($emails->contains('opiekun@demo.pl'));
    }

    public function test_search_matches_first_name_last_name_and_email_case_insensitively(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $emails = collect(
            $this->getJson('/api/v1/admin/users?search=MARTA')->assertOk()->json('data')
        )->pluck('email');

        $this->assertTrue($emails->contains('marta@demo.pl'));
    }

    public function test_default_sort_is_newest_first(): void
    {
        $this->seed();
        User::factory()->role('volunteer')->create(['created_at' => now()->addDay()]);
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $timestamps = collect(
            $this->getJson('/api/v1/admin/users')->assertOk()->json('data')
        )->pluck('created_at')->all();

        $sorted = $timestamps;
        rsort($sorted);
        $this->assertSame($sorted, $timestamps);
    }

    public function test_per_page_is_capped_at_100(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $this->getJson('/api/v1/admin/users?per_page=500')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }

    public function test_volunteer_is_forbidden(): void
    {
        Sanctum::actingAs(User::factory()->role('volunteer')->create());

        $this->getJson('/api/v1/admin/users')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_guest_is_unauthenticated(): void
    {
        $this->getJson('/api/v1/admin/users')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }
}
