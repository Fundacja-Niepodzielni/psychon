<?php

namespace Tests\Feature\Bezpieczenstwo;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Próby luk z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersze V7.1.3, V7.2.1 i V7.2.2.
 *
 * Odrzucenie tokenu (401) i odmowa roli (403) kończą się odpowiedzią bez żadnego
 * wpisu w logu, więc próby nadużyć nie zostawiają śladu.
 */
class RejestrZdarzenTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string DOKUMENT = 'docs/bezpieczenstwo/przeglad-asvs-dane.md';

    public function test_odmowa_dostepu_jest_zapisywana_w_logu(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersze V7.1.3, V7.2.2: odmowa 403 nie jest zapisywana.');

        Log::spy();
        $this->actingAsRole('volunteer');

        $this->getJson('/api/v1/admin/users')->assertStatus(403);

        Log::shouldHaveReceived('warning')->once();
    }

    public function test_odrzucenie_tokenu_jest_zapisywane_w_logu(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V7.2.1: odrzucenie tokenu 401 nie jest zapisywane.');

        Log::spy();

        $this->withHeader('Authorization', 'Bearer nieprawidlowy')
            ->getJson('/api/v1/me')
            ->assertStatus(401);

        Log::shouldHaveReceived('warning')->once();
    }
}
