<?php

namespace Tests\Feature\H18;

use App\Models\User;
use App\Queries\AdminUserQuery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * Pakiet H18 · AdminUserQuery — wspólne zapytanie listy i CSV.
 * Filtry `role`, `status`, `search` oraz domyślne sortowanie `-created_at`.
 */
class AdminUserQueryTest extends TestCase
{
    use RefreshDatabase;

    private function emailsFor(array $params): array
    {
        $request = Request::create('/admin/users', 'GET', $params);

        return AdminUserQuery::fromRequest($request)->pluck('email')->all();
    }

    public function test_role_filter(): void
    {
        User::factory()->role('volunteer')->create(['email' => 'v@demo.pl']);
        User::factory()->role('instructor')->create(['email' => 'i@demo.pl']);

        $this->assertSame(['v@demo.pl'], $this->emailsFor(['role' => 'volunteer']));
    }

    public function test_status_filter(): void
    {
        User::factory()->create(['email' => 'a@demo.pl', 'status' => 'active']);
        User::factory()->create(['email' => 'b@demo.pl', 'status' => 'blocked']);

        $this->assertSame(['b@demo.pl'], $this->emailsFor(['status' => 'blocked']));
    }

    public function test_search_matches_names_and_email_case_insensitively(): void
    {
        User::factory()->create(['first_name' => 'Kowalski', 'email' => 'k@demo.pl']);
        User::factory()->create(['first_name' => 'Nowak', 'email' => 'n@demo.pl']);

        $this->assertSame(['k@demo.pl'], $this->emailsFor(['search' => 'kowal']));
        $this->assertSame(['n@demo.pl'], $this->emailsFor(['search' => 'N@DEMO']));
    }

    public function test_default_sort_is_created_at_desc(): void
    {
        User::factory()->create(['email' => 'old@demo.pl', 'created_at' => now()->subDays(3)]);
        User::factory()->create(['email' => 'new@demo.pl', 'created_at' => now()]);

        $this->assertSame(['new@demo.pl', 'old@demo.pl'], $this->emailsFor([]));
    }

    public function test_unknown_sort_falls_back_to_created_at_desc(): void
    {
        User::factory()->create(['email' => 'old@demo.pl', 'created_at' => now()->subDays(3)]);
        User::factory()->create(['email' => 'new@demo.pl', 'created_at' => now()]);

        $this->assertSame(['new@demo.pl', 'old@demo.pl'], $this->emailsFor(['sort' => 'bogus']));
    }
}
