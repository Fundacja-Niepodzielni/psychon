<?php

namespace App\Http\Requests\Courses;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CourseIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'product_group' => ['sometimes', 'string', Rule::in(['psychon', 'dobrostan', 'both'])],
        ];
    }

    public function messages(): array
    {
        return [
            'product_group.in' => 'Nieznana grupa produktowa.',
        ];
    }
}
