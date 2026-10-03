<?php

namespace Tests\Concerns;

use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Support\Sso\KeycloakTokenFactory;

/**
 * Żądania z prawdziwym tokenem lokalnego realmu testowego
 * (`KeycloakTokenFactory`, bez sieci): role osoby wywołującej pochodzą z
 * `realm_access.roles` tokenu, tak jak na produkcji — bez `actingAs`.
 */
trait ActsWithRealmToken
{
    private ?KeycloakTokenFactory $testRealm = null;

    protected function realm(): KeycloakTokenFactory
    {
        return $this->testRealm ??= (new KeycloakTokenFactory)->installAsRealm();
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function boundAccount(string $role, array $attributes = []): User
    {
        return User::factory()->role($role)->create(array_merge([
            'keycloak_sub' => (string) Str::uuid(),
        ], $attributes));
    }

    /**
     * Token z rolą `$tokenRole` (domyślnie lokalna rola konta).
     */
    protected function withTokenOf(User $user, ?string $tokenRole = null): static
    {
        $this->realm();
        $this->app['auth']->forgetGuards();

        $token = $this->realm()->mint([
            'sub' => $user->keycloak_sub,
            'realm_access' => ['roles' => [config('keycloak.roles.'.($tokenRole ?? $user->role))]],
        ]);

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    /**
     * Wiązanie konta z odnośnika zaproszenia tożsamością o potwierdzonym adresie.
     */
    protected function bindWithInvitation(string $email, string $invitationToken): TestResponse
    {
        $this->realm();
        // Każde żądanie produkcyjne startuje ze strażą `web`; wcześniejsze żądanie
        // `auth:keycloak` w tej samej instancji aplikacji testowej by ją przestawiło.
        $this->app['auth']->shouldUse('web');
        $this->app['auth']->forgetGuards();

        $bearer = $this->realm()->mint([
            'sub' => (string) Str::uuid(),
            'email' => $email,
            'email_verified' => true,
        ]);

        return $this->withHeader('Authorization', 'Bearer '.$bearer)
            ->postJson('/api/v1/sso/powiaz', ['token' => $invitationToken]);
    }
}
