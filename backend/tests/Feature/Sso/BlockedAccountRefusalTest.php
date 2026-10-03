<?php

namespace Tests\Feature\Sso;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Konto zablokowane mówi o sobie osobie z ważnym tokenem: 401 z kodem
 * `konto_zablokowane`, w kopercie złożonej wyłącznie ze `status`, `code` i
 * `message`. Po kodzie ekran logowania odróżnia konto zablokowane od konta
 * jeszcze niepowiązanego (`konto_niepowiazane` z `sub`).
 *
 * Odpowiedź nie niesie niczego poza stanem: ani `reason`, ani powodu blokady
 * (żyje w rekordzie i w dzienniku administracji), ani daty, ani identyfikatora
 * osoby.
 */
class BlockedAccountRefusalTest extends TestCase
{
    use RefreshDatabase;

    private const ME_ROUTE = '/api/v1/me';

    private KeycloakTokenFactory $realm;

    protected function setUp(): void
    {
        parent::setUp();
        $this->realm = (new KeycloakTokenFactory)->installAsRealm();
    }

    private function tokenFor(string $sub, string $keycloakRole = 'wolontariusz'): string
    {
        return $this->realm->mint(['sub' => $sub, 'realm_access' => ['roles' => [$keycloakRole]]]);
    }

    private function newRequest(): void
    {
        // Każde żądanie rozstrzyga strażnik od nowa — jak dwa osobne żądania w produkcji.
        $this->app['auth']->forgetGuards();
    }

    public function test_a_blocked_account_gets_401_konto_zablokowane_with_status_code_and_message_only(): void
    {
        $sub = (string) Str::uuid();
        User::factory()->role('volunteer')->create([
            'status' => 'blocked',
            'keycloak_sub' => $sub,
            'email' => 'osoba-zablokowana@example.test',
        ]);

        $response = $this->withHeader('Authorization', 'Bearer '.$this->tokenFor($sub))
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.status', 401)
            ->assertJsonPath('error.code', 'konto_zablokowane');

        $this->assertSame(['status', 'code', 'message'], array_keys($response->json('error')));
        $this->assertSame(['error'], array_keys($response->json()));
        $this->assertStringNotContainsString($sub, (string) $response->getContent());
        $this->assertStringNotContainsString('osoba-zablokowana', (string) $response->getContent());
        $this->assertStringNotContainsString('reason', (string) $response->getContent());
    }

    public function test_every_business_route_behind_the_guard_says_the_same(): void
    {
        $sub = (string) Str::uuid();
        User::factory()->role('volunteer')->create(['status' => 'blocked', 'keycloak_sub' => $sub]);
        $token = $this->tokenFor($sub);

        foreach (['/api/v1/me', '/api/v1/courses', '/api/v1/notifications'] as $path) {
            $this->newRequest();
            $response = $this->withHeader('Authorization', 'Bearer '.$token)
                ->getJson($path)
                ->assertStatus(401)
                ->assertJsonPath('error.code', 'konto_zablokowane');

            $this->assertSame(['status', 'code', 'message'], array_keys($response->json('error')));
        }
    }

    public function test_the_reason_typed_by_the_administrator_never_reaches_the_blocked_person(): void
    {
        $adminSub = (string) Str::uuid();
        User::factory()->role('super_admin')->create(['keycloak_sub' => $adminSub]);
        $adminToken = $this->tokenFor($adminSub, 'admin-fundacja');

        $personSub = (string) Str::uuid();
        $person = User::factory()->role('volunteer')->create(['status' => 'active', 'keycloak_sub' => $personSub]);
        $personToken = $this->tokenFor($personSub);

        $powod = 'powod-wpisany-przez-administracje-9f3a';
        $this->withHeader('Authorization', 'Bearer '.$adminToken)
            ->postJson("/api/v1/admin/users/{$person->id}/block", ['reason' => $powod])
            ->assertOk();
        $this->newRequest();

        $response = $this->withHeader('Authorization', 'Bearer '.$personToken)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'konto_zablokowane');

        $this->assertStringNotContainsString($powod, (string) $response->getContent());
        $this->assertStringNotContainsString('9f3a', (string) $response->getContent());
    }

    public function test_an_unbound_token_is_still_reported_as_unbound_with_its_sub_and_not_as_blocked(): void
    {
        $sub = (string) Str::uuid();

        $response = $this->withHeader('Authorization', 'Bearer '.$this->tokenFor($sub))
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'konto_niepowiazane');

        $this->assertSame($sub, $response->json('error.reason.sub'));
        $this->assertSame(['status', 'code', 'message', 'reason'], array_keys($response->json('error')));
    }

    public function test_an_invited_account_that_is_not_bound_yet_is_still_reported_as_unbound(): void
    {
        // Konto zaproszone, ale jeszcze bez `keycloak_sub`: token z obcym `sub` nie znajduje konta.
        User::factory()->role('volunteer')->create(['status' => 'invited', 'keycloak_sub' => null]);
        $sub = (string) Str::uuid();

        $response = $this->withHeader('Authorization', 'Bearer '.$this->tokenFor($sub))
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'konto_niepowiazane');

        $this->assertSame($sub, $response->json('error.reason.sub'));
    }

    public function test_deleted_and_anonymized_accounts_keep_the_plain_indistinguishable_refusal(): void
    {
        $deletedSub = (string) Str::uuid();
        User::factory()->role('volunteer')->create(['status' => 'deleted', 'keycloak_sub' => $deletedSub]);

        $anonymizedSub = (string) Str::uuid();
        User::factory()->role('volunteer')->create([
            'status' => 'blocked',
            'anonymized_at' => now(),
            'keycloak_sub' => $anonymizedSub,
        ]);

        foreach ([$deletedSub, $anonymizedSub] as $sub) {
            $this->newRequest();
            $response = $this->withHeader('Authorization', 'Bearer '.$this->tokenFor($sub))
                ->getJson(self::ME_ROUTE)
                ->assertStatus(401)
                ->assertJsonPath('error.code', 'unauthenticated');

            $this->assertArrayNotHasKey('reason', $response->json('error'));
        }
    }

    public function test_after_unblocking_the_person_gets_in_and_the_refusal_is_gone(): void
    {
        $adminSub = (string) Str::uuid();
        User::factory()->role('super_admin')->create(['keycloak_sub' => $adminSub]);
        $adminToken = $this->tokenFor($adminSub, 'admin-fundacja');

        $personSub = (string) Str::uuid();
        $person = User::factory()->role('volunteer')->create(['status' => 'blocked', 'keycloak_sub' => $personSub]);
        $personToken = $this->tokenFor($personSub);

        $this->withHeader('Authorization', 'Bearer '.$personToken)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'konto_zablokowane');
        $this->newRequest();

        $this->withHeader('Authorization', 'Bearer '.$adminToken)
            ->postJson("/api/v1/admin/users/{$person->id}/unblock")
            ->assertOk();
        $this->newRequest();

        $response = $this->withHeader('Authorization', 'Bearer '.$personToken)
            ->getJson(self::ME_ROUTE)
            ->assertOk()
            ->assertJsonPath('data.id', $person->id);

        $this->assertStringNotContainsString('konto_zablokowane', (string) $response->getContent());
    }
}
