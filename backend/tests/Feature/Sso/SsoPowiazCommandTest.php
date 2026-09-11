<?php

namespace Tests\Feature\Sso;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * `php artisan psychon:sso-powiaz {userId} {sub}` — operator bootstrap
 * (stage E1). No e-mail lookup: the operator names the row by id.
 */
class SsoPowiazCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_binds_explicitly_by_id(): void
    {
        $user = User::factory()->create();
        $sub = (string) Str::uuid();

        $this->artisan('psychon:sso-powiaz', ['userId' => $user->id, 'sub' => $sub])
            ->assertExitCode(0);

        $user->refresh();
        $this->assertSame($sub, $user->keycloak_sub);
    }

    public function test_refuses_a_sub_already_bound_to_another_user(): void
    {
        $sub = (string) Str::uuid();
        User::factory()->create(['keycloak_sub' => $sub]);
        $other = User::factory()->create();

        $this->artisan('psychon:sso-powiaz', ['userId' => $other->id, 'sub' => $sub])
            ->assertExitCode(1);

        $other->refresh();
        $this->assertNull($other->keycloak_sub);
    }
}
