<?php

namespace App\Http\Requests\H01;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class RespondCooperationRequestRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
    }

    public function rules(): array
    {
        return [
            'response' => ['required', 'string', 'max:2000'],
            'status' => ['required', 'string', 'in:answered,closed'],
        ];
    }

    public function messages(): array
    {
        return [
            'response.required' => 'Wpisz odpowiedź dla osoby zgłaszającej.',
            'response.string' => 'Odpowiedź musi być tekstem.',
            'response.max' => 'Odpowiedź może mieć najwyżej 2000 znaków.',
            'status.required' => 'Wybierz status zgłoszenia.',
            'status.in' => 'Status po odpowiedzi może być tylko „answered” albo „closed”.',
        ];
    }
}
