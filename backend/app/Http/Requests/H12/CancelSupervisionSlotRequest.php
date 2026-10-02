<?php

namespace App\Http\Requests\H12;

use App\Services\Auth\TokenRoles;
use App\Services\H12\SupervisionSlotService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * `DELETE /admin/supervision/slots/{id}` — odwołanie terminu. Rola
 * rozstrzyga pierwsza (403), potem stan terminu: nieznany → 404, już
 * odwołany → 409 `slot_cancelled`; wszystko przed ciałem żądania.
 */
class CancelSupervisionSlotRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        if (! $roles->has('project_manager', 'super_admin')) {
            return false;
        }

        SupervisionSlotService::assertManageable(
            (int) $this->route('id'),
            SupervisionSlotService::ALREADY_CANCELLED_MESSAGE,
        );

        return true;
    }

    public function rules(): array
    {
        return [];
    }
}
