<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\MessageThread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as RouteDefinition;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\Concerns\ActsAsRole;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Probes for the medium-risk gaps found by the ASVS 5.0 L2 review of
 * authentication, session management and authorization
 * (`docs/bezpieczenstwo/przeglad-asvs-dostep.md`, sections 3–5).
 *
 * Every probe is marked incomplete on its first line, so the gate stays
 * green while the gap is open. The assertions below that line describe the
 * target state after the fix: once a gap is closed, delete the
 * `markTestIncomplete` line and the probe becomes a regression test.
 * The row number in each message points at the table row it documents.
 */
class LukiAsvsDostepuTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    public function test_asvs_6_3_4_every_identity_binding_path_is_documented(): void
    {
        $this->markTestIncomplete('Luka ASVS 6.3.4 (przeglad-asvs-dostep.md, wiersz 6.3.4): ścieżki wiązania tożsamości nie są opisane w dokumentacji architektury, a kontrakt API opisuje usunięte logowanie hasłem.');

        $architecture = (string) file_get_contents(base_path('../docs/system/01-architektura-i-integracje.md'));
        $contract = (string) file_get_contents(base_path('../docs/hackathon/02-kontrakt-api.md'));

        $principalOnlyPaths = collect(Route::getRoutes()->getRoutes())
            ->filter(fn (RouteDefinition $route): bool => in_array('auth.keycloak', $route->gatherMiddleware(), true))
            ->map(fn (RouteDefinition $route): string => '/'.Str::after($route->uri(), 'api/v1/'));

        $this->assertNotEmpty($principalOnlyPaths);

        foreach ($principalOnlyPaths as $path) {
            $this->assertStringContainsString($path, $architecture, "Ścieżka {$path} nie jest opisana w architekturze.");
        }

        $this->assertStringNotContainsString('POST /auth/login', $contract);
    }

    public function test_asvs_6_4_1_an_old_invitation_token_no_longer_binds_an_account(): void
    {
        $this->markTestIncomplete('Luka ASVS 6.4.1 (przeglad-asvs-dostep.md, wiersz 6.4.1): token zaproszenia nie ma terminu ważności i jest przechowywany jawnie.');

        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $invitationToken = 'tok-'.Str::random(20);
        $user = User::factory()->invited()->create(['activation_token' => $invitationToken]);

        $this->travel(30)->days();

        $this->withHeader('Authorization', 'Bearer '.$realm->mint(['email' => $user->email, 'email_verified' => true]))
            ->postJson('/api/v1/sso/powiaz', ['token' => $invitationToken])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_token');

        $this->assertNull($user->fresh()->keycloak_sub);
        $this->assertDatabaseMissing('users', ['id' => $user->id, 'activation_token' => $invitationToken]);
    }

    public function test_asvs_6_8_4_admin_routes_require_the_expected_authentication_strength(): void
    {
        $this->markTestIncomplete('Luka ASVS 6.8.4 (przeglad-asvs-dostep.md, wiersz 6.8.4): trasy administracyjne nie sprawdzają poziomu uwierzytelnienia (acr/amr) z tokenu.');

        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('super_admin')->create(['keycloak_sub' => $sub]);

        $passwordOnlyToken = $realm->mint([
            'sub' => $sub,
            'realm_access' => ['roles' => ['admin-fundacja']],
            'acr' => '1',
            'amr' => ['pwd'],
        ]);

        $this->withHeader('Authorization', 'Bearer '.$passwordOnlyToken)
            ->getJson('/api/v1/admin/users')
            ->assertForbidden();
    }

    public function test_asvs_7_4_1_a_subject_only_backchannel_logout_ends_the_session(): void
    {
        $this->markTestIncomplete('Luka ASVS 7.4.1 (przeglad-asvs-dostep.md, wiersz 7.4.1, punkt a): wylogowanie kanałem zwrotnym z samym `sub` nie zapisuje znacznika, więc token tej sesji dalej działa.');

        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('volunteer')->create(['keycloak_sub' => $sub]);
        $accessToken = $realm->mint(['sub' => $sub, 'sid' => 'sid-'.Str::uuid()]);

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson('/api/v1/me')
            ->assertOk();

        $this->postJson('/oidc/backchannel-logout', ['logout_token' => $realm->mintLogoutToken(['sub' => $sub])])
            ->assertOk();

        // The request guard caches its resolved user per instance.
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson('/api/v1/me')
            ->assertUnauthorized();
    }

    public function test_asvs_7_4_5_administration_can_end_a_users_sessions_without_blocking(): void
    {
        $this->markTestIncomplete('Luka ASVS 7.4.5 (przeglad-asvs-dostep.md, wiersz 7.4.5): administracja może tylko zablokować konto, nie może zakończyć jego sesji.');

        // The exact route is a contract decision; the probe only requires
        // that some administrative route for ending a user's sessions exists.
        $sessionRoutes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn (RouteDefinition $route): bool => str_starts_with($route->uri(), 'api/v1/admin/users/{id}/')
                && str_contains($route->uri(), 'session'));

        $this->assertNotEmpty($sessionRoutes);
    }

    public function test_asvs_8_1_2_field_level_access_rules_are_documented(): void
    {
        $this->markTestIncomplete('Luka ASVS 8.1.2 (przeglad-asvs-dostep.md, wiersz 8.1.2): brak dokumentacji uprawnień do pól (odczyt i zapis per rola).');

        $matrix = (string) file_get_contents(base_path('../docs/system/03-role-i-uprawnienia.md'));

        $this->assertMatchesRegularExpression('/uprawnienia do pól/iu', $matrix);
    }

    public function test_asvs_8_2_2_an_instructor_cannot_assign_an_unassigned_volunteer_to_themselves(): void
    {
        $this->markTestIncomplete('Luka ASVS 8.2.2 (przeglad-asvs-dostep.md, wiersz 8.2.2): prowadzący sam tworzy przypisanie superwizora dla dowolnego nieprzypisanego wolontariusza; zachowanie utrwala GroupThreadCompositionTest — wymaga decyzji właściciela matrycy.');

        $instructor = $this->actingAsRole('instructor');
        $volunteer = User::factory()->role('volunteer')->create();

        $thread = MessageThread::query()->create([
            'type' => 'group',
            'supervisor_id' => $instructor->id,
        ]);

        $status = $this->postJson("/api/v1/threads/{$thread->id}/members/{$volunteer->id}")->status();

        $this->assertContains($status, [403, 404]);
        $this->assertDatabaseMissing('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $instructor->id,
        ]);
    }
}
