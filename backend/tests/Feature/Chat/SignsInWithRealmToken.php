<?php

namespace Tests\Feature\Chat;

use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Support\Sso\KeycloakTokenFactory;

/**
 * Uwierzytelnienie prawdziwym tokenem z lokalnego, testowego realmu
 * (`KeycloakTokenFactory`, bez sieci) — role w `realm_access.roles`, nie
 * zapasowe role z `actingAs`.
 */
trait SignsInWithRealmToken
{
    private ?KeycloakTokenFactory $testRealm = null;

    protected function account(string $role, array $attributes = []): User
    {
        return User::factory()->role($role)->create(array_merge([
            'keycloak_sub' => (string) Str::uuid(),
        ], $attributes));
    }

    protected function signedInAs(User $user, ?string $role = null): static
    {
        $this->testRealm ??= (new KeycloakTokenFactory)->installAsRealm();
        $this->app['auth']->forgetGuards();

        $role ??= $user->role;
        $token = $this->testRealm->mint([
            'sub' => $user->keycloak_sub,
            'realm_access' => ['roles' => [config("keycloak.roles.{$role}")]],
        ]);

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    /**
     * Żądanie z ciałem, które nie jest poprawnym JSON-em.
     */
    protected function postMalformedJson(string $uri): TestResponse
    {
        return $this->sendMalformedJson('POST', $uri);
    }

    protected function sendMalformedJson(string $method, string $uri): TestResponse
    {
        return $this->call(
            $method,
            $uri,
            [],
            [],
            [],
            $this->transformHeadersToServerVars(array_merge($this->defaultHeaders, [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ])),
            '{"body": "niedomknięte',
        );
    }
}
