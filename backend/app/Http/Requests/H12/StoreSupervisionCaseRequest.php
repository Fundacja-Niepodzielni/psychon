<?php

namespace App\Http\Requests\H12;

use App\Models\SupervisorAssignment;
use App\Services\Auth\TokenRoles;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class StoreSupervisionCaseRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('instructor');
    }

    public function rules(): array
    {
        return [
            'subject' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:5000'],
            'volunteer_id' => ['sometimes', 'nullable', 'integer'],
        ];
    }

    public function messages(): array
    {
        return [
            'subject.required' => 'Podaj temat zgłoszenia.',
            'subject.string' => 'Temat musi być tekstem.',
            'subject.max' => 'Temat może mieć najwyżej 255 znaków.',
            'body.required' => 'Opisz zgłaszaną sprawę.',
            'body.string' => 'Treść musi być tekstem.',
            'body.max' => 'Treść jest zbyt długa.',
            'volunteer_id.integer' => 'Identyfikator osoby musi być liczbą.',
        ];
    }

    /**
     * Osoba spoza własnej grupy i osoba nieistniejąca dostają to samo zdanie —
     * odpowiedź nie mówi, czy wskazany identyfikator istnieje.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->has('volunteer_id')) {
                return;
            }

            $volunteerId = $this->input('volunteer_id');

            if ($volunteerId === null) {
                return;
            }

            $belongsToOwnGroup = SupervisorAssignment::query()
                ->where('supervisor_id', $this->user()->id)
                ->where('volunteer_id', $volunteerId)
                ->whereNull('unassigned_at')
                ->exists();

            if (! $belongsToOwnGroup) {
                $validator->errors()->add(
                    'volunteer_id',
                    'Możesz wskazać wyłącznie osobę ze swojej grupy.',
                );
            }
        });
    }
}
