<?php

namespace App\Http\Requests\H07;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class ListInstructorReliabilityRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('instructor');
    }

    public function rules(): array
    {
        return collect(array_keys($this->query()))
            ->mapWithKeys(fn (string $key): array => [$key => ['prohibited']])
            ->all();
    }

    public function messages(): array
    {
        return [
            'prohibited' => 'Tego parametru nie obsługuje to zapytanie.',
        ];
    }
}
