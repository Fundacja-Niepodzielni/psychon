<?php

namespace App\Http\Requests\H18;

use App\Services\H18\AccountManagementGuard;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/users/{id}/anonymize — anonimizacja konta (H18, trasa
 * `role:super_admin`). Konto, własne konto i ostatnie aktywne konto
 * administracji są sprawdzane w `authorize()`, przed walidacją ciała;
 * `UserAnonymizer` powtarza je na zablokowanych wierszach. Audyt
 * `user.anonymized` bez ładunku (kontrakt, aneks z 2026-09-17, pkt 4).
 */
class AnonymizeUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        $guard = app(AccountManagementGuard::class);
        $target = $guard->target($this->route('id'));

        $guard->assertMayManage($target);
        AccountManagementGuard::assertNotOwnAccount($target, $this->user(), AccountManagementGuard::cannotAnonymizeSelf());
        AccountManagementGuard::assertNotLastActiveAdministrator($target);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }
}
