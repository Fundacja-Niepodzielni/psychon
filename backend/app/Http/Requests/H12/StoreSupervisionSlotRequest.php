<?php

namespace App\Http\Requests\H12;

use App\Http\Requests\H12\Concerns\SupervisionSlotRules;
use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class StoreSupervisionSlotRequest extends FormRequest
{
    use SupervisionSlotRules;

    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('instructor');
    }

    public function rules(): array
    {
        return $this->slotRules(partial: false);
    }
}
