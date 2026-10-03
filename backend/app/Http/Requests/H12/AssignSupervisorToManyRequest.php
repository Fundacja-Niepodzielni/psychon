<?php

namespace App\Http\Requests\H12;

use App\Models\User;
use App\Services\Auth\TokenRoles;
use App\Services\H12\SupervisorAssignmentService;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Przypisanie jednego prowadzącego wielu osobom naraz
 * (`POST /admin/supervisor-assignments`). Uprawnienie jest to samo co w
 * `AssignSupervisorRequest` (trasa pojedyncza). Prowadzący jest sprawdzany
 * raz dla całego żądania tym samym warunkiem co na trasie pojedynczej
 * (`SupervisorAssignmentService::canSupervise`), więc odmowa przy pojedynczej
 * osobie znaczy wyłącznie „tej osoby nie można przypisać”. Osoby
 * nieistniejące nie są odrzucane walidacją — wracają w wyniku jako
 * `not_found`, obok pozostałych.
 */
class AssignSupervisorToManyRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
    }

    public function rules(): array
    {
        return [
            'supervisor_id' => [
                'bail',
                'required',
                'integer',
                'exists:users,id',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! SupervisorAssignmentService::canSupervise(User::query()->find((int) $value))) {
                        $fail(SupervisorAssignmentService::SUPERVISOR_NOT_ALLOWED);
                    }
                },
            ],
            'user_ids' => ['bail', 'required', 'list', 'min:1', 'max:'.SupervisorAssignmentService::MAX_PEOPLE_AT_ONCE],
            'user_ids.*' => ['bail', 'required', 'integer:strict', 'min:1', 'distinct:strict'],
        ];
    }

    public function messages(): array
    {
        return [
            'supervisor_id.required' => 'Wybierz superwizora.',
            'supervisor_id.integer' => 'Identyfikator superwizora musi być liczbą.',
            'supervisor_id.exists' => 'Wybrany superwizor nie istnieje.',
            'user_ids.required' => 'Wskaż co najmniej jedną osobę.',
            'user_ids.list' => 'Osoby podaj jako listę identyfikatorów.',
            'user_ids.min' => 'Wskaż co najmniej jedną osobę.',
            'user_ids.max' => 'Jednym żądaniem można przypisać najwyżej '.SupervisorAssignmentService::MAX_PEOPLE_AT_ONCE.' osób.',
            'user_ids.*.required' => 'Identyfikator osoby jest wymagany.',
            'user_ids.*.integer' => 'Identyfikator osoby musi być liczbą całkowitą.',
            'user_ids.*.min' => 'Identyfikator osoby musi być liczbą dodatnią.',
            'user_ids.*.distinct' => 'Ta sama osoba występuje na liście więcej niż raz.',
        ];
    }

    /**
     * @return list<int>
     */
    public function userIds(): array
    {
        return array_map(intval(...), $this->validated('user_ids'));
    }
}
