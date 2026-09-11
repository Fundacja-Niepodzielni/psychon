<?php

namespace Tests\Unit\H03;

use App\Http\Requests\H03\RejectApplicationRequest;
use App\Services\Auth\TokenRoles;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * R2 (sprint-2 §1): `authorize()` decides by the ACCESS TOKEN's roles
 * (`TokenRoles`), never `users.role` — so this unit test drives it with
 * `TokenRoles::TESTING_FALLBACK_ROLES` (the same testing-only escape hatch
 * `Tests\TestCase::actingAs()` uses) instead of a `User` carrying a `role`
 * column. A plain Laravel `TestCase` (not a bare PHPUnit one) is required
 * here so `app()`/`config()` are available for that binding — it never
 * touches the database, so `wspolna-baza` (like every other DB-trait-less
 * class in this suite) makes that explicit for the parallel runner.
 */
#[Group('wspolna-baza')]
class RejectApplicationRequestTest extends TestCase
{
    public function test_reason_is_required_and_must_be_a_non_empty_string(): void
    {
        $rules = (new RejectApplicationRequest)->rules();

        $this->assertContains('required', $rules['reason']);
        $this->assertContains('string', $rules['reason']);
        $this->assertContains('filled', $rules['reason']);
    }

    public function test_only_administrative_roles_are_authorized(): void
    {
        foreach (['project_manager', 'super_admin'] as $role) {
            $request = RejectApplicationRequest::create('/api/v1/admin/applications/1/reject', 'POST');

            $this->assertTrue($request->authorize($this->tokenRoles($role)));
        }

        $request = RejectApplicationRequest::create('/api/v1/admin/applications/1/reject', 'POST');

        $this->assertFalse($request->authorize($this->tokenRoles('instructor')));
    }

    private function tokenRoles(string ...$localRoles): TokenRoles
    {
        $this->app->instance(TokenRoles::TESTING_FALLBACK_ROLES, $localRoles);

        return app(TokenRoles::class);
    }
}
