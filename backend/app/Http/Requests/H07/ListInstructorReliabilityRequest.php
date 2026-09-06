<?php

namespace App\Http\Requests\H07;

use Illuminate\Foundation\Http\FormRequest;

class ListInstructorReliabilityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'instructor';
    }

    public function rules(): array
    {
        return collect(array_keys($this->query()))
            ->mapWithKeys(fn (string $key): array => [$key => ['prohibited']])
            ->all();
    }
}
