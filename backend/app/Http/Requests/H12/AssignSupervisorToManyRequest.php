<?php

namespace App\Http\Requests\H12;

use App\Models\User;
use App\Services\Auth\TokenRoles;
use App\Services\H12\SupervisorAssignmentService;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Przypisanie jednego prowadzącego wielu osobom naraz
 * (`POST /admin/supervisor-assignments`). Uprawnienie i reguła
 * `supervisor_id` są te same co w `AssignSupervisorRequest`; rolę
 * prowadzącego sprawdzamy tu raz dla całego żądania, żeby odmowa przy
 * pojedynczej osobie znaczyła wyłącznie „tej osoby nie można przypisać”.
 * Osób nieistniejących nie odrzucamy walidacją — wracają w wyniku jako
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
                'required',
                'integer',
                'exists:users,id',
                function (string $attribute, mixed $value, Closure $fail): void {
                    $role = User::query()->whereKey((int) $value)->value('role');
                    if ($role !== null && $role !== 'instructor') {
                        $fail('Wybrana osoba nie ma roli prowadzącego.');
                    }
                },
            ],
            'user_ids' => ['required', 'array', 'min:1', 'max:'.SupervisorAssignmentService::MAX_PEOPLE_AT_ONCE],
            'user_ids.*' => ['required', 'integer', 'min:1', 'distinct'],
        ];
    }

    public function messages(): array
    {
        return [
            'supervisor_id.required' => 'Wybierz superwizora.',
            'supervisor_id.integer' => 'Identyfikator superwizora musi być liczbą.',
            'supervisor_id.exists' => 'Wybrany superwizor nie istnieje.',
            'user_ids.required' => 'Wskaż co najmniej jedną osobę.',
            'user_ids.array' => 'Lista osób musi być tablicą identyfikatorów.',
            'user_ids.min' => 'Wskaż co najmniej jedną osobę.',
            'user_ids.max' => 'Jednym żądaniem można przypisać najwyżej '.SupervisorAssignmentService::MAX_PEOPLE_AT_ONCE.' osób.',
            'user_ids.*.required' => 'Identyfikator osoby jest wymagany.',
            'user_ids.*.integer' => 'Identyfikator osoby musi być liczbą.',
            'user_ids.*.min' => 'Identyfikator osoby musi być liczbą dodatnią.',
            'user_ids.*.distinct' => 'Ta sama osoba występuje na liście więcej niż raz.',
        ];
    }
}
