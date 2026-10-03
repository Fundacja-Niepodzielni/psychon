<?php

namespace Tests\Feature\H18;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Karta osoby w panelu (`GET /admin/users/{id}`) pokazuje role tej osoby
 * z danych platformy, a nie role administratora, który ją ogląda. Własny
 * profil (`GET /me`) nadal pokazuje role z bieżącego tokena.
 */
class PersonCardRolesTest extends TestCase
{
    use RefreshDatabase;

    private function bearer(User $user, string $realmRole): static
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$realm->mint([
            'sub' => $user->keycloak_sub,
            'realm_access' => ['roles' => [$realmRole]],
        ]));
    }

    private function account(string $role): User
    {
        return User::factory()->role($role)->create(['keycloak_sub' => (string) Str::uuid()]);
    }

    public function test_administrator_sees_the_volunteer_role_on_the_volunteer_card(): void
    {
        $manager = $this->account('project_manager');
        $volunteer = $this->account('volunteer');

        $this->bearer($manager, 'koordynator')
            ->getJson("/api/v1/admin/users/{$volunteer->id}")
            ->assertOk()
            ->assertJsonPath('data.profile.role', 'volunteer')
            ->assertJsonPath('data.profile.roles', ['volunteer']);
    }

    public function test_super_admin_sees_the_instructor_role_on_the_instructor_card(): void
    {
        $admin = $this->account('super_admin');
        $instructor = $this->account('instructor');

        $this->bearer($admin, 'admin-fundacja')
            ->getJson("/api/v1/admin/users/{$instructor->id}")
            ->assertOk()
            ->assertJsonPath('data.profile.roles', ['instructor']);
    }

    public function test_own_profile_still_lists_the_roles_of_the_token(): void
    {
        $volunteer = $this->account('volunteer');

        $this->bearer($volunteer, 'admin-fundacja')
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.roles', ['super_admin']);
    }

    public function test_own_profile_of_a_volunteer_lists_the_volunteer_role(): void
    {
        $volunteer = $this->account('volunteer');

        $this->bearer($volunteer, 'wolontariusz')
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.role', 'volunteer')
            ->assertJsonPath('data.roles', ['volunteer']);
    }

    public function test_administrator_opening_the_own_card_sees_the_roles_of_the_token(): void
    {
        $manager = $this->account('project_manager');

        $this->bearer($manager, 'koordynator')
            ->getJson("/api/v1/admin/users/{$manager->id}")
            ->assertOk()
            ->assertJsonPath('data.profile.roles', ['project_manager']);
    }
}
