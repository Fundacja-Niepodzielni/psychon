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
        User::factory()->role('volunteer')->create(['last_name' => 'Testowa', 'email' => 'v@demo.pl']);
        User::factory()->role('instructor')->create(['last_name' => 'Testowa', 'email' => 'i@demo.pl']);

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
        // Nazwiska są USTAWIONE, nie losowane. Powód jest zmierzony, nie teoretyczny:
        // `APP_FAKER_LOCALE=pl_PL`, a około 1,9% losowanych nazwisk polskich zawiera
        // „kowal" (Kowalski, Kowalska, Kowalczyk — pomiar: 95 trafień na 5000 losowań).
        // Przy losowym nazwisku drugiego konta ten test przegrywał mniej więcej raz na
        // pięćdziesiąt przebiegów, bez związku z jakąkolwiek zmianą w kodzie — i wtedy
        // czerwień trafiała do rachunku sesji, która akurat uruchomiła suitę.
        // Zielone było faktem o losowaniu, nie o systemie.
        User::factory()->create(['first_name' => 'Kowalski', 'last_name' => 'Testowa', 'email' => 'k@demo.pl']);
        User::factory()->create(['first_name' => 'Nowak', 'last_name' => 'Testowa', 'email' => 'n@demo.pl']);

        $this->assertSame(['k@demo.pl'], $this->emailsFor(['search' => 'kowal']));
        $this->assertSame(['n@demo.pl'], $this->emailsFor(['search' => 'N@DEMO']));
    }

    public function test_search_matches_the_last_name_too(): void
    {
        // Zależność, która wcześniej działała PRZYPADKIEM i dlatego psuła tamten test,
        // tutaj jest sprawdzana JAWNIE: wyszukiwanie obejmuje także nazwisko.
        // Reguła nie znika — przestaje być niespodzianką.
        User::factory()->create(['first_name' => 'Anna', 'last_name' => 'Kowalczyk', 'email' => 'a@demo.pl']);
        User::factory()->create(['first_name' => 'Piotr', 'last_name' => 'Testowa', 'email' => 'p@demo.pl']);

        $this->assertSame(['a@demo.pl'], $this->emailsFor(['search' => 'kowal']));
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
