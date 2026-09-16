<?php

namespace Tests\Unit\H12;

use App\Http\Requests\H12\UpdateAttendanceRequest;
use App\Services\Auth\TokenRoles;
use PHPUnit\Framework\Attributes\DataProvider;
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
class UpdateAttendanceRequestTest extends TestCase
{
    public function test_only_the_instructor_role_is_authorized(): void
    {
        $request = UpdateAttendanceRequest::create('/api/v1/instructor/slots/1/attendance', 'PATCH');

        $this->assertTrue($request->authorize($this->tokenRoles('instructor')));
    }

    /**
     * Każda rola ma własny przypadek danych, żeby porażka jednej nie
     * zasłaniała pozostałych dwóch (pętla z `break` na pierwszym `assertFalse`
     * kończyłaby bieg po jednej roli i milczała o reszcie).
     */
    public static function nieuprawnioneRole(): array
    {
        return [
            'project_manager' => ['project_manager'],
            'super_admin' => ['super_admin'],
            'volunteer' => ['volunteer'],
        ];
    }

    #[DataProvider('nieuprawnioneRole')]
    public function test_administrative_and_other_roles_are_not_authorized(string $role): void
    {
        $request = UpdateAttendanceRequest::create('/api/v1/instructor/slots/1/attendance', 'PATCH');

        $this->assertFalse(
            $request->authorize($this->tokenRoles($role)),
            "rola „{$role}” nie powinna mieć dostępu do zmiany obecności.",
        );
    }

    public function test_a_request_with_no_token_roles_is_not_authorized(): void
    {
        $request = UpdateAttendanceRequest::create('/api/v1/instructor/slots/1/attendance', 'PATCH');

        $this->assertFalse($request->authorize($this->tokenRoles()));
    }

    private function tokenRoles(string ...$localRoles): TokenRoles
    {
        $this->app->instance(TokenRoles::TESTING_FALLBACK_ROLES, $localRoles);

        return app(TokenRoles::class);
    }
}
