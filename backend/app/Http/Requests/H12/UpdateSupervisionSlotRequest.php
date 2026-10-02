<?php

namespace App\Http\Requests\H12;

use App\Http\Requests\H12\Concerns\SupervisionSlotRules;
use App\Services\Auth\TokenRoles;
use App\Services\H12\SupervisionSlotService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * `PATCH /admin/supervision/slots/{id}` — edycja terminu. Rola rozstrzyga
 * pierwsza (403), potem stan terminu: nieznany → 404, odwołany → 409
 * `slot_cancelled` — oba PRZED walidacją ciała, więc odpowiedź dla
 * odwołanego albo nieznanego terminu nie zależy od treści żądania.
 */
class UpdateSupervisionSlotRequest extends FormRequest
{
    use SupervisionSlotRules;

    public function authorize(TokenRoles $roles): bool
    {
        if (! $roles->has('project_manager', 'super_admin')) {
            return false;
        }

        SupervisionSlotService::assertManageable(
            (int) $this->route('id'),
            SupervisionSlotService::CANCELLED_EDIT_MESSAGE,
        );

        return true;
    }

    public function rules(): array
    {
        return $this->slotRules(partial: true);
    }
}
