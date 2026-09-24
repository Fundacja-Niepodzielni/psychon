<?php

namespace Tests\Unit\Services\Keycloak;

use App\Services\Keycloak\KeycloakPrincipal;
use Illuminate\Foundation\Testing\TestCase;

/**
 * Boots the application for `config()` only; no database connection is opened.
 */
class KeycloakPrincipalTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['keycloak.roles' => [
            'super_admin' => 'admin-fundacja',
            'instructor' => 'prowadzacy',
            'volunteer' => 'wolontariusz',
            'student' => '',
        ]]);
    }

    public function test_it_exposes_the_token_claims(): void
    {
        $principal = new KeycloakPrincipal('sub-1', ['prowadzacy'], 'sid-1');

        $this->assertSame('sub-1', $principal->sub);
        $this->assertSame(['prowadzacy'], $principal->roles);
        $this->assertSame('sid-1', $principal->sid);
        $this->assertNull((new KeycloakPrincipal('sub-1', []))->sid);
    }

    public function test_has_role_matches_raw_realm_roles_exactly(): void
    {
        $principal = new KeycloakPrincipal('sub-1', ['prowadzacy', 'wymaga-2fa']);

        $this->assertTrue($principal->hasRole('prowadzacy'));
        $this->assertTrue($principal->hasRole('wymaga-2fa'));
        $this->assertFalse($principal->hasRole('instructor'));
        $this->assertFalse($principal->hasRole('Prowadzacy'));
    }

    public function test_authorizing_roles_maps_whitelisted_realm_roles_to_local_names(): void
    {
        $principal = new KeycloakPrincipal('sub-1', ['wolontariusz', 'admin-fundacja']);

        $this->assertSame(['super_admin', 'volunteer'], $principal->authorizingRoles());
    }

    public function test_authorizing_roles_drops_realm_roles_outside_the_whitelist(): void
    {
        $principal = new KeycloakPrincipal('sub-1', ['wymaga-2fa', 'psycholog', 'super_admin']);

        $this->assertSame([], $principal->authorizingRoles());
    }

    public function test_an_empty_whitelist_entry_never_matches(): void
    {
        $this->assertSame([], (new KeycloakPrincipal('sub-1', ['']))->authorizingRoles());
    }

    public function test_no_roles_or_no_whitelist_grant_nothing(): void
    {
        $this->assertSame([], (new KeycloakPrincipal('sub-1', []))->authorizingRoles());

        config(['keycloak.roles' => null]);
        $this->assertSame([], (new KeycloakPrincipal('sub-1', ['prowadzacy']))->authorizingRoles());
    }

    public function test_has_authorizing_role_accepts_any_of_the_given_local_roles(): void
    {
        $principal = new KeycloakPrincipal('sub-1', ['prowadzacy']);

        $this->assertTrue($principal->hasAuthorizingRole('instructor'));
        $this->assertTrue($principal->hasAuthorizingRole('super_admin', 'instructor'));
    }

    public function test_has_authorizing_role_rejects_raw_realm_names_and_empty_input(): void
    {
        $principal = new KeycloakPrincipal('sub-1', ['prowadzacy']);

        $this->assertFalse($principal->hasAuthorizingRole('prowadzacy'));
        $this->assertFalse($principal->hasAuthorizingRole('super_admin', 'volunteer'));
        $this->assertFalse($principal->hasAuthorizingRole());
    }
}
