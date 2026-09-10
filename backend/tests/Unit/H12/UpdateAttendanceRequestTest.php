<?php

namespace Tests\Unit\H12;

use App\Http\Requests\H12\UpdateAttendanceRequest;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class UpdateAttendanceRequestTest extends TestCase
{
    public function test_only_the_instructor_role_is_authorized(): void
    {
        $request = UpdateAttendanceRequest::create('/api/v1/instructor/slots/1/attendance', 'PATCH');
        $request->setUserResolver(fn (): User => new User(['role' => 'instructor']));

        $this->assertTrue($request->authorize());
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
        $request->setUserResolver(fn (): User => new User(['role' => $role]));

        $this->assertFalse($request->authorize(), "rola „{$role}” nie powinna mieć dostępu do zmiany obecności.");
    }

    public function test_a_request_without_a_resolved_user_is_not_authorized(): void
    {
        $request = UpdateAttendanceRequest::create('/api/v1/instructor/slots/1/attendance', 'PATCH');
        $request->setUserResolver(fn (): ?User => null);

        $this->assertFalse($request->authorize());
    }
}
