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
 * Every probe asserts the behaviour that makes the gap real today, so it
 * runs green while the gap is open and turns red the moment someone closes
 * it. That red is intended: whoever fixes the gap inverts the probe into a
 * regression test and updates the matching table row. Each failure message
 * names that row.
 */
class LukiAsvsDostepuTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const ARCHITECTURE_DOC = '../docs/system/01-architektura-i-integracje.md';

    private const CONTRACT_DOC = '../docs/hackathon/02-kontrakt-api.md';

    private const ROLE_MATRIX_DOC = '../docs/system/03-role-i-uprawnienia.md';

    public function test_asvs_6_3_4_identity_binding_paths_are_missing_from_the_architecture_doc(): void
    {
        $architecture = (string) file_get_contents(base_path(self::ARCHITECTURE_DOC));
        $contract = (string) file_get_contents(base_path(self::CONTRACT_DOC));

        $principalOnlyPaths = collect(Route::getRoutes()->getRoutes())
            ->filter(fn (RouteDefinition $route): bool => in_array('auth.keycloak', $route->gatherMiddleware(), true))
            ->map(fn (RouteDefinition $route): string => '/'.Str::after($route->uri(), 'api/v1/'))
            ->sort()
            ->values()
            ->all();

        $undocumented = array_values(array_filter(
            $principalOnlyPaths,
            fn (string $path): bool => ! str_contains($architecture, $path),
        ));

        $this->assertSame(
            ['/applications/first-login', '/sso/powiaz', '/sso/whoami'],
            $undocumented,
            'Wiersz 6.3.4: zmienił się zbiór nieudokumentowanych ścieżek wiązania tożsamości — zaktualizuj próbę i wiersz dokumentu.',
        );
        $this->assertStringContainsString(
            'POST /auth/login',
            $contract,
            'Wiersz 6.3.4: kontrakt przestał opisywać usunięte logowanie hasłem — zaktualizuj wiersz dokumentu.',
        );
    }

    public function test_asvs_6_4_1_a_month_old_invitation_token_still_binds_an_account(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $invitationToken = 'tok-'.Str::random(20);
        $user = User::factory()->invited()->create(['activation_token' => $invitationToken]);

        $this->assertDatabaseHas('users', ['id' => $user->id, 'activation_token' => $invitationToken]);

        $this->travel(30)->days();

        $this->withHeader('Authorization', 'Bearer '.$realm->mint([
            'sub' => $sub,
            'email' => $user->email,
            'email_verified' => true,
        ]))
            ->postJson('/api/v1/sso/powiaz', ['token' => $invitationToken])
            ->assertOk();

        $this->assertSame(
            $sub,
            $user->fresh()->keycloak_sub,
            'Wiersz 6.4.1: zaproszenie sprzed 30 dni przestało wiązać konto — luka zamknięta, odwróć próbę.',
        );
    }

    public function test_asvs_6_8_4_admin_routes_accept_a_password_only_token(): void
    {
        $this->seed();
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
            ->assertOk();
    }

    public function test_asvs_7_4_1_a_subject_only_backchannel_logout_leaves_the_session_usable(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('volunteer')->create(['keycloak_sub' => $sub]);
        $accessToken = $realm->mint(['sub' => $sub, 'sid' => 'sid-'.Str::uuid()]);

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson('/api/v1/me')
            ->assertOk();

        $this->postJson('/oidc/backchannel-logout', ['logout_token' => $realm->mintLogoutToken(['sub' => $sub])])
            ->assertOk()
            ->assertJsonPath('decision', 'SKIPPED');

        // The request guard caches its resolved user per instance.
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson('/api/v1/me')
            ->assertOk();
    }

    public function test_asvs_7_4_5_administration_has_no_route_to_end_a_users_sessions(): void
    {
        $userRoutes = collect(Route::getRoutes()->getRoutes())
            ->map(fn (RouteDefinition $route): string => $route->uri())
            ->filter(fn (string $uri): bool => str_starts_with($uri, 'api/v1/admin/users/{id}/'))
            ->sort()
            ->values();

        $this->assertContains('api/v1/admin/users/{id}/block', $userRoutes);
        $this->assertSame(
            [],
            $userRoutes->filter(fn (string $uri): bool => str_contains($uri, 'session'))->values()->all(),
            'Wiersz 7.4.5: pojawiła się trasa kończenia sesji użytkownika — luka zamknięta, odwróć próbę.',
        );
    }

    public function test_asvs_8_1_2_the_role_matrix_has_no_field_level_rules(): void
    {
        $matrix = (string) file_get_contents(base_path(self::ROLE_MATRIX_DOC));
        $contract = (string) file_get_contents(base_path(self::CONTRACT_DOC));

        $this->assertDoesNotMatchRegularExpression(
            '/uprawnienia do pól/iu',
            $matrix,
            'Wiersz 8.1.2: matryca ról ma już reguły dla pól — luka zamknięta, odwróć próbę.',
        );
        $this->assertStringContainsString('pole `email` tylko do odczytu', $contract);
    }

    public function test_asvs_8_2_2_an_instructor_assigns_an_unassigned_volunteer_to_themselves(): void
    {
        $this->seed();
        $instructor = $this->actingAsRole('instructor');
        $volunteer = User::factory()->role('volunteer')->create();

        $thread = MessageThread::query()->create([
            'type' => 'group',
            'supervisor_id' => $instructor->id,
        ]);

        $this->postJson("/api/v1/threads/{$thread->id}/members/{$volunteer->id}")
            ->assertCreated();

        $this->assertDatabaseHas('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $instructor->id,
            'unassigned_at' => null,
        ]);

        $this->getJson('/api/v1/instructor/group')
            ->assertOk()
            ->assertJsonPath('data.members.0.id', $volunteer->id);
    }
}
