<?php

namespace Tests\Feature\AccessExpiry;

use App\Models\Edition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * H04 · `access.active` — kryterium ★1: konto z datą wsteczną blokuje
 * treści programu (403 `access_expired`), ale NIE logowanie, profil,
 * eksport RODO ani onboarding. Kryterium 3: `program_completed_at` zdejmuje
 * limit.
 *
 * Trasy pokryte tu to te, które dziś istnieją na `main` i celowo (nie)
 * używają `access.active` — patrz komentarze "criterion 2/1, shared test
 * with H04" w routes/api/{h01,h06,h10,h11,h13,h14,h21}.php. H06/H10 też
 * bramkują `access.active` na trasach lekcji/testów (widoczne w kodzie),
 * ale nie mają fabryk modeli (Course/Lesson/Test) — pominięte tu, żeby nie
 * budować kruchych fixture'ów; pokrywają je własne testy pakietów.
 */
class AccessExpiryEnforcementTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // H14's DocumentController (used in the blocked/exempt matrices below)
        // reads Settings::activeEdition() — needs one active edition row.
        Edition::factory()->create(['status' => 'active']);
    }

    private function expiredVolunteer(): User
    {
        return $this->actingAsRole('volunteer', [
            'access_expires_at' => now()->subDay(),
        ]);
    }

    /**
     * Trasy „treści programu" — muszą blokować wygasły dostęp.
     */
    public static function blockedRoutes(): array
    {
        return [
            'GET /internship/entries (H11)' => [['GET', '/api/v1/internship/entries']],
            'POST /internship/entries (H11)' => [['POST', '/api/v1/internship/entries', ['date' => '2026-01-01', 'hours' => '1', 'form' => 'phone_duty', 'description' => 'x']]],
            'GET /certificate/conditions (H13)' => [['GET', '/api/v1/certificate/conditions']],
            'POST /certificate/generate (H13)' => [['POST', '/api/v1/certificate/generate']],
            'GET /documents (H14)' => [['GET', '/api/v1/documents']],
            'POST /documents/generate (H14)' => [['POST', '/api/v1/documents/generate', ['type' => 'volunteer_agreement']]],
        ];
    }

    #[DataProvider('blockedRoutes')]
    public function test_expired_access_blocks_programme_content(array $call): void
    {
        $this->expiredVolunteer();

        [$method, $uri, $body] = [$call[0], $call[1], $call[2] ?? []];

        $this->json($method, $uri, $body)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'access_expired');
    }

    /**
     * Wyjątki: logowanie, profil, eksport RODO, onboarding — muszą działać
     * mimo wygasłego dostępu.
     */
    public static function exemptRoutes(): array
    {
        return [
            'GET /me (H01)' => [['GET', '/api/v1/me'], 200],
            'PATCH /me (H01)' => [['PATCH', '/api/v1/me', []], 200],
            'POST /me/exports (H01)' => [['POST', '/api/v1/me/exports'], 202],
            'GET /onboarding (H21)' => [['GET', '/api/v1/onboarding'], 200],
        ];
    }

    #[DataProvider('exemptRoutes')]
    public function test_expired_access_does_not_block_exempt_routes(array $call, int $expectStatus): void
    {
        $this->expiredVolunteer();

        [$method, $uri, $body] = [$call[0], $call[1], $call[2] ?? []];

        $this->json($method, $uri, $body)->assertStatus($expectStatus);
    }

    public function test_login_works_regardless_of_expired_access(): void
    {
        $user = User::factory()->create([
            'password' => 'demo1234',
            'access_expires_at' => now()->subYear(),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'demo1234',
        ])->assertOk();
    }

    public function test_completed_programme_lifts_the_access_limit(): void
    {
        $this->actingAsRole('volunteer', [
            'access_expires_at' => now()->subYear(),
            'program_completed_at' => now()->subDay(),
        ]);

        $this->getJson('/api/v1/documents')->assertOk();
    }

    public function test_future_expiry_does_not_block(): void
    {
        $this->actingAsRole('volunteer', [
            'access_expires_at' => now()->addMonth(),
        ]);

        $this->getJson('/api/v1/documents')->assertOk();
    }

    public function test_no_expiry_date_never_blocks(): void
    {
        $this->actingAsRole('volunteer', [
            'access_expires_at' => null,
        ]);

        $this->getJson('/api/v1/documents')->assertOk();
    }
}
