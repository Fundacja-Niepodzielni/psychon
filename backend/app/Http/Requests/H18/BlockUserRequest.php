<?php

namespace App\Http\Requests\H18;

use App\Services\H18\AccountManagementGuard;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/users/{id}/block — zablokowanie konta z wymaganym powodem
 * (H18). Powód trafia do audytu `user.blocked` (kontrakt §3.2). Konto,
 * zasięg osoby wywołującej, własne konto i ostatnie aktywne konto administracji są
 * sprawdzane w `authorize()`, przed walidacją powodu.
 */
class BlockUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        $guard = app(AccountManagementGuard::class);
        $target = $guard->target($this->route('id'));

        $guard->assertMayManage($target);
        AccountManagementGuard::assertNotOwnAccount($target, $this->user(), AccountManagementGuard::cannotBlockSelf());
        AccountManagementGuard::assertNotLastActiveAdministrator($target);

        return true;
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:1', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'reason.required' => 'Podaj powód blokady konta.',
            'reason.string' => 'Powód musi być tekstem.',
            'reason.max' => 'Powód jest za długi (maksymalnie :max znaków).',
        ];
    }
}
