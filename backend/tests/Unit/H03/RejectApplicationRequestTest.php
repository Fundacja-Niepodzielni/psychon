<?php

namespace Tests\Unit\H03;

use App\Http\Requests\H03\RejectApplicationRequest;
use App\Models\User;
use PHPUnit\Framework\TestCase;

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
            $request->setUserResolver(fn (): User => new User(['role' => $role]));

            $this->assertTrue($request->authorize());
        }

        $request = RejectApplicationRequest::create('/api/v1/admin/applications/1/reject', 'POST');
        $request->setUserResolver(fn (): User => new User(['role' => 'instructor']));

        $this->assertFalse($request->authorize());
    }
}
